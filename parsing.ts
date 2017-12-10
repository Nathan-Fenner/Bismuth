
import {
    Token,
    TokenStream,
    TokenSelector,
    selectsToken,
    showToken,
    ParseError,
} from './lex';


type Maker<From, To> = To | ((x: From) => To);

class ParserFor<T> {
    constructor(public run: (stream: TokenStream) => {result: T, rest: TokenStream}) {}
    then<S>(other: Maker<T, ParserFor<S>>): ParserFor<T&S> {
        return new ParserFor(stream => {
            let first = this.run(stream);
            let second = (typeof other == "function" ? other(first.result) as any : other).run(first.rest);
            if (first.result instanceof Array) {
                if (Object.keys(second.result).length == 0) {
                    return {result: first.result, rest: second.rest};
                }
                throw {message: "bad - combining array with object", first, second};
            }
            if (second.result instanceof Array) {
                if (Object.keys(first.result).length == 0) {
                    return {result: second.result, rest: second.rest};
                }
                throw {message: "bad - combining array with object", first, second};
            }
            return {
                result: Object.assign({}, first.result, second.result),
                rest: second.rest,
            };
        });
    }
    thenInstead<S>(other: (result: T) => ParserFor<S>): ParserFor<S> {
        return new ParserFor(stream => {
            let first = this.run(stream);
            return other(first.result).run(first.rest);
        });
    }
    thenIn<P>(otherMap: {[k in keyof P]: Maker<T, ParserFor<P[k]>>}): ParserFor<T & P> {
        if (Object.keys(otherMap).length != 1) {
            throw {message: "thenIn given map with more or less than one key", otherMap};
        }
        let key: keyof typeof otherMap = Object.keys(otherMap)[0] as any;
        let other = otherMap[key];
        return new ParserFor(stream => {
            let first = this.run(stream);
            let second = (typeof other == "function" ? other(first.result) : other).run(first.rest);
            return {
                result: Object.assign({}, first.result, {[key]: second.result}) as any,
                rest: second.rest,
            };
        });
    }
    thenToken<P extends {[k: string]: string}>(map: P, fail: Maker<T, string>): ParserFor<T & {[k in keyof P]: Token}> {
        let keys: (keyof P)[] = Object.keys(map) as (keyof P)[]; // QUESTION: why isn't this the inferred type?
        if (keys.length != 1) {
            throw "bad thenToken call";
        }
        let key: keyof P = keys[0];
        let pattern = map[key];
        return this.thenWhen({
            [pattern as string]: (token: Token) => pure<{[k in keyof P]: Token}>({[key]: token} as any), // QUESTION: why does this need a cast?
        },  typeof fail == "function" ? ((x: T) => ParserFor.fail(fail(x))) : ParserFor.fail(fail));
    }
    manyBetween<S>(between: TokenSelector): ParserFor<T[]> {
        return new ParserFor((stream): {result: T[], rest: TokenStream} => {
            let first = this.run(stream);
            let current = first.rest;
            let pieces = [first.result];
            while (true) {
                if (!selectsToken(between, current.head())) {
                    return {result: pieces, rest: current};
                }
                current = current.tail(); // skip the separating token
                let next = this.run(current);
                pieces.push(next.result);
                current = next.rest;
            }
        });
    }
    manyUntil(finish: TokenSelector, otherwise: ParserFor<any>): ParserFor<T[]> {
        return new ParserFor(stream => {
            let current = stream;
            let result: T[] = [];
            while (true) {
                if (!current.head()) {
                    return otherwise.run(current);
                }
                if (selectsToken(finish, current.head())) {
                    return {result, rest: current};
                }
                let piece = this.run(current);
                result.push(piece.result);
                current = piece.rest;
            }
        })
    }
    manyWhen(leads: TokenSelector[]): ParserFor<{lead: Token, item: T}[]> {
        return new ParserFor(stream => {
            let current = stream;
            let result: {lead: Token, item: T}[] = [];
            while (true) {
                let found = false;
                for (let lead of leads) {
                    if (selectsToken(lead, current.head())) {
                        let pieceResult = this.run(current.tail());
                        result.push({item: pieceResult.result, lead: current.head()});
                        current = pieceResult.rest;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    break;
                }
            }
            return {result, rest: current};
        });
    }
    map<S>(f: (x: T) => S): ParserFor<S> {
        return new ParserFor(stream => {
            let okay = this.run(stream);
            return {result: f(okay.result), rest: okay.rest};
        });
    }
    merge<M>(m: M): ParserFor<T & M> {
        return this.map(v => {
            return Object.assign({}, v, m);
        });
    }
    static fail(message: string | ((t: Token) => string)): ParserFor<never> {
        let messageMaker = typeof message !== "string" ? message : (token: Token) => message + " near " + showToken(token);
        return new ParserFor(stream => {throw new ParseError(messageMaker(stream.head()))});
    }
    context(message: string): ParserFor<T> {
        return new ParserFor(stream => {
            try {
                return this.run(stream);
            } catch (e) {
                if (e instanceof ParseError) {
                    throw new ParseError(message + ("\n" + e.message).replace(/\n/g, "\n\t"));
                }
                throw e;
            }
        });
    }
    thenWhen<M, E>(m: {[K in keyof M]: Maker<Token, ParserFor<M[K]>>}, otherwise: Maker<T, ParserFor<E>>): ParserFor<T & (M[keyof M] | E)> {
        if (typeof otherwise == "function") {
            return this.then(res => ParserFor.when(m, otherwise(res)));
        } else {
            return this.then(ParserFor.when(m, otherwise));
        }
    }
    static when<M, E>(m: {[K in keyof M]: Maker<Token, ParserFor<M[K]>>}, otherwise: ParserFor<E>): ParserFor<M[keyof M] | E> {
        return new ParserFor<M[keyof M] | E>((stream: TokenStream): {result: M[keyof M] | E, rest: TokenStream} => {
            for (let k in m) {
                let p = m[k];
                if (k.charAt(0) == "$") {
                    if (stream.head().type == k.substr(1)) {
                        if (typeof p === "function") {
                            const intermediate = p(stream.head());
                            return intermediate.run(stream.tail());
                        } else {
                            return p.run(stream.tail());
                        }
                    }
                } else {
                    if (stream.head().text == k) {
                        if (typeof p === "function") {
                            let parser: ParserFor<M[keyof M]> = p(stream.head());
                            return parser.run(stream.tail());
                        } else {
                            return p.run(stream.tail());
                        }
                    }
                }
            }
            return otherwise.run(stream);
        });
    }
}

function pure<T>(t: T): ParserFor<T> {
    return new ParserFor(stream => {
        return {result: t, rest: stream};
    });
}

function matched<T>(parser: ParserFor<T>): (open: Token) => ParserFor<T> {
    const matching = (open: Token): string => {
        if (open.text == "(") {
            return ")";
        }
        if (open.text == "[") {
            return "]";
        }
        if (open.text == "{") {
            return "}";
        }
        throw {message: "invalid opening brace", open};
    };
    return (open: Token) => parser.thenWhen({ [matching(open)]: pure({})}, ParserFor.fail(`expected '${matching(open)}' to close '${open.text}' opened at ${showToken(open)}`));
}

export {
    ParserFor,
    pure,
    matched,
};