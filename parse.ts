
type ObjHas<Obj, K extends string> = ({[K in keyof Obj]: '1' } & { [k: string]: '0' })[K];
type IfObjHas<Obj, K extends string, Yes, No = never> = ({[K in keyof Obj]: Yes } & { [k: string]: No })[K];
type Overwrite<K, T> = {[P in keyof T | keyof K]: { 1: T[P], 0: K[P] }[ObjHas<T, P>]};

type InsertNode<Shape, Variety extends keyof Shape> = {
    [prop in keyof Shape[Variety]]: Shape[Variety][prop] | {$new: (self: Ref<Variety>) => Shape[Variety][prop]}
}

let uniqueCount = 0;
function unique(): string {
    return "U" + (uniqueCount++);
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Graph                                                                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

class Ref<Type> {
    static universal_map: {[x: string]: any} = {};
    constructor(
        public readonly type: Type,
        public readonly identifier: string
    ) {
        // only one occurrence
        const signature = type + ":::" + identifier;
        if (signature in Ref.universal_map) {
            return Ref.universal_map[signature];
        }
        Ref.universal_map[signature] = this;
    }
    toString(): string {
        return "###" + this.type + "/" + this.identifier;
    }
}

class Lazy<T> {
    private identifier: string; // for debugging only
    private mode: "suspended" | "running" | "done" = "suspended";
    private value: T;
    private make: () => T;
    constructor(make: () => T, identifier: string = "unknown") {
        this.make = make;
        this.identifier = identifier;
    }
    need(): T {
        if (this.mode == "done") {
            return this.value;
        }
        if (this.mode == "running") {
            throw "loop on " + this.identifier;
        }
        this.mode = "running";
        this.value = this.make();
        this.mode = "done";
        return this.value;
    }
}

function shallowCopy<T>(x: T): T {
    let result: T = {} as any;
    for (let k in x) {
        result[k] = x[k];
    }
    return result;
}

class GraphOf<Shape> {
    public readonly shapeType: Shape = null as any;
    constructor(private readonly nodes: {
        [Variety in keyof Shape]: {
            [id: string]: Shape[Variety],
        }
    }) {}
    declare<New>(extra: keyof New): GraphOf<Overwrite<Shape, New>> {
        const nodes: any = {};
        Object.assign(nodes, this.nodes);
        nodes[extra] = {};
        return new GraphOf(nodes);
    }
    insert<Variety extends keyof Shape>(insertVariety: Variety, properties: Shape[Variety]): Ref<Variety> {
        let newId = unique();
        let self = new Ref(insertVariety, newId);
        this.nodes[insertVariety][newId] = {} as any;
        for (let property in properties) {
            if (typeof properties[property] == "object" && properties[property] != null && ("$new" in properties[property])) {
                // see second pass
            } else {
                this.nodes[insertVariety][newId][property] = properties[property];
            }
        }
        for (let property in properties) {
            if (typeof properties[property] == "object" && properties[property] != null && ("$new" in properties[property])) {
                this.nodes[insertVariety][newId][property] = (properties[property] as any).$new(self);
            } else {
                // see first pass
            }
        }
        return self;
    }
    // TODO: use "Overwrite" judiciously instead of "&"
    compute<Extra>(generators: {[Variety in keyof Extra]: { [Key in keyof Extra[Variety]]: (self: (Shape&Extra)[Variety], result: GraphOf<Shape&Extra>, selfRef: Ref<Variety>) => Extra[Variety][Key] } }): GraphOf<Shape & Extra> {
        let result: GraphOf<Shape & Extra> = new GraphOf<Shape & Extra>({} as any);
        for (let variety in this.nodes) {
            result.nodes[variety] = {};
            for (let id in this.nodes[variety]) {
                result.nodes[variety] = Object.assign({}, this.nodes[variety]) as any;
            }
        }
        // Now, add the properties (lazily) to the graph.
        for (let variety in generators) {
            if (!(variety in this.nodes)) {
                throw "invalid variety in compute(): " + variety;
            }
            for (let id in result.nodes[variety]) {
                for (let newProperty in generators[variety]) {
                    let lazy = new Lazy(() => generators[variety][newProperty](result.nodes[variety][id], result, new Ref(variety, id)), `attribute ${newProperty} on node ${id} of type ${variety}`);
                    Object.defineProperty(result.nodes[variety][id], newProperty, {
                        get: () => lazy.need(),
                        enumerable: true,
                        configurable: true,
                    });
                }
            }
        }
        for (let variety in generators) {
            for (let id in result.nodes[variety]) {
                for (let newProperty in generators[variety]) {
                    // force the property.
                    let value = result.nodes[variety][id][newProperty];
                    delete result.nodes[variety][id][newProperty];
                    result.nodes[variety][id][newProperty] = value;
                }
            }
        }
        // TODO: consider forcing all properties now to ensure that they're computed "on time"
        return result;
    }
    get<Variety extends keyof Shape>(ref: Ref<Variety>): Shape[Variety] {
        if (ref.identifier in this.nodes[ref.type]) {
            return this.nodes[ref.type][ref.identifier]
        }
        throw {
            message: "no such id of given variety",
            graph: this,
            variety: ref.type,
            id: ref.identifier,
        };
    }
    each<Variety extends keyof Shape>(variety: Variety, call: (node: Shape[Variety], ref: Ref<Variety>) => void) {
        for (let id in this.nodes[variety]) {
            call(this.nodes[variety][id], new Ref(variety, id));
        }
    }
}

// GraphOf<Shape> describes an immutable graph with convenient transformation methods.
/* 
let g1 = new GraphOf({});
 let g2 = g1.declare<{Foo: {x: number, y: Ref<"Foo"> | null}}>("Foo")
 let g3 = g2.insert("Foo", {
   x: 5,
   y: {
     $new: "Foo",
     is: (self, make): any => make("Foo", {x: 7, y: null}),
  },
});
let g4 = g3.compute<{Foo: {xSquared: number}}>({Foo: {xSquared: (self) => self.x * self.x }});
g4.each("Foo", node => {
    console.log("node", "x:", node.x, "y:", node.y, "xSquared:", node.xSquared);
});
*/

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Lex                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

type TokenLocation = string

type Token = {
    text: string,
    type: string,
    location: TokenLocation,
}

function showToken(token: Token): string {
    return `\`${token.text}\` at ${token.location}`;
}
class ParseError {
    constructor(public readonly message: string) {}
}

function lex(source: string): Token[] | ParseError {
    let result: Token[] = [];
    let start = 0;
    let rules: {[n: string]: RegExp} = {
        integer: /^[0-9]+/,
        name: /^[a-zA-Z_][a-zA-Z_0-9]*/,
        whitespace: /^\s+/,
        comment: /^\/\/[^\n]*/,
        string: new RegExp(`^"([^"]|\\")*"`),
        special: /^[()\]\[.,;:#|{}!]/,
        operator: /^[+\-*/=<>?%^~]+/,
    };
    let special = ["func", "self", "never", "struct", "enum", "switch", "of", "case", "yield", "is", "and", "or", "if", "while", "var", "for", "else", "service", "effect", "return", "break", "continue"];
    while (start < source.length) {
        let next: null | Token = null;
        for (let tokenType in rules) {
            let match = source.substr(start).match(rules[tokenType]);
            if (!match) {
                continue;
            }
            if (!next || next.text.length < match[0].length) {
                next = {text: match[0], type: tokenType, location: "char " + start};
            }
        }
        if (!next) {
            return new Error(`unknown token at character ${start}`);
        }
        start += next.text.length;
        if (special.indexOf(next.text) >= 0) {
            next.type = "special";
        }
        result.push(next);
    }
    result.push({text: "", type: "end", location: "end of script"});
    return result.filter(token => ["comment", "whitespace"].indexOf(token.type) < 0);
}

class TokenStream {
    constructor(private tokens: Token[], private position: number = 0) {}
    head(): Token {
        return this.tokens[this.position];
    }
    tail(): TokenStream {
        return new TokenStream(this.tokens, Math.min(this.tokens.length-1, this.position + 1));
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
// AST                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////


//
// Declarations
//

type DeclareStruct = {
    declare: "struct",
    name: Token,
    generics: Generic[],
    fields: {
        name: Token,
        type: Type,
        // TODO: metadata
    }[],
}

type DeclareEnum = {
    declare: "enum",
    name: Token,
    generics: Generic[],
    variants: {
        name: Token,
        type: Type | null,
    }[],
}

type DeclareFunction = {
    declare: "function",
    name: Token,
    generics: Generic[],
    effects: Token[], // TODO: more-complex effects?
    arguments: { name: Token, type: Type }[],
    returns: Type | null,
    body: Block,
}

type DeclareInterface = {
    declare: "interface",
    name: Token,
    parents: Token[],
    methods: {name: Token, type: FunctionType}[],
}

type DeclareEffect = {
    // TODO: generic effects
    declare: "effect",
    actions: {name: Token, type: FunctionType}[],
}

/*
service Count(initial: Integer) for Counter -> Self {
	var value: Integer = initial;
	yield return var result => {
		return result;
	} when case get!() => {
		continue value;
	} when case inc!() => {
		value = value + 1;
		continue;
	} when case incBy!(var n: Integer) => {
		value = value + n;
		continue;
	}
}
*/

type DeclareService = {
    declare: "service",
    name: Token,
    effects: Token[], // TODO: something more complex
    arguments: {name: Token, type: Type}[],
    returns: Type | null,
    body: Block, // allows the 'yield' statement once
}

type Declare = DeclareStruct | DeclareEnum | DeclareFunction | DeclareInterface | DeclareEffect | DeclareService;

//
// Types
//

type Generic = {
    name: Token,
    constraints: Token[],
}

type NamedType = {
    type: "named",
    name: Token,
    parameters: Type[],
};
type FunctionType = {
    type: "function",
    generics: Generic[],
    effects: Token[], // TODO: more complex?; empty means pure
    arguments: Type[],
    returns: Type | null,
}

// TODO: consider first-class services

type NeverType = {
    type: "never",
    never: Token | null,
}

type SelfType = {
    type: "self",
    self: Token | null,
}

type Type = NamedType | FunctionType | NeverType | SelfType;

//
// Effects
//

// TODO

//
// Statements
//

type VariableStatement = {statement: "var", name: Token, type: Type, expression: Expression} // TODO: optional initialization
type AssignStatement = {statement: "assign", lhs: Expression, rhs: Expression}; // TODO: more-complex assignments; but these are just sugar
type IfStatement = {statement: "if", condition: Expression, thenBlock: Block, elseBlock: Block | null};
type WhileStatement = {statement: "while", condition: Expression, bodyBlock: Block};
// TODO: For Statement
type ExpressionStatement = {statement: "expression", expression: Expression}; // used for effectful
type ReturnStatement = {statement: "return", expression: Expression | null};
type BreakStatement = {statement: "break"};
type ContinueStatement = {statement: "continue"};
type YieldStatement = {
    statement: "yield",
    returns: {result: Token, type: Type, block: Block}, // type must be Self
    actions: {parameters: {name: Token, type: Type}[], block: Block},
}
type SwitchStatement = {
    statement: "switch",
    expression: Expression,
    branches: {
        pattern: {name: Token, variable: {name: Token, type: Type} | null},
        block: Block[],
    }[],
}
type Statement = VariableStatement | AssignStatement | ExpressionStatement | IfStatement | WhileStatement | ReturnStatement | BreakStatement | ContinueStatement | YieldStatement | SwitchStatement;

type Block = Statement[];

//
// Expressions
//

type IntegerExpression = {expression: "integer", token: Token};
type StringExpression = {expression: "string", token: Token};
type VariableExpression = {expression: "variable", variable: Token};
type DotExpression = {expression: "dot", object: Expression, field: Token};
type CallExpression = {expression: "call", hasEffect: boolean, function: Expression, arguments: Expression[]};
type ServiceExpression = {expression: "service", service: Token, arguments: Expression[], body: Expression}; // discharges or reinterprets effects
type ObjectExpression = {expression: "object", name: Token, fields: {name: Token, value: Expression}[]};
type ArrayExpression = {expression: "array", name: Token | null, items: Expression[]};
// TODO: map expression
type OperatorExpression = {expression: "operator", operator: Token, left: Expression, right: Expression};
type PrefixExpression = {expression: "prefix", operator: Token, right: Expression};
// TODO: impure function expressions + briefer lambdas + void
type FunctionExpression = {expression: "function", generics: Generic[], arguments: {name: Token, type: Type}[], returns: Type, body: Block}

type Expression = IntegerExpression | StringExpression | VariableExpression | DotExpression | CallExpression | ServiceExpression | ObjectExpression | ArrayExpression | OperatorExpression | PrefixExpression | FunctionExpression;


////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Parse                                                                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

type Maker<From, To> = To | ((x: From) => To);

type TokenSelector = string;

function selectsToken(selector: string, token: Token): boolean {
    if (selector.charAt(0) == "$") {
        return token.type == selector.substr(1);
    } else {
        return token.text == selector;
    }
}

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
        let key = Object.keys(otherMap)[0];
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
        let keys: (keyof P)[] = Object.keys(map) as (keyof P)[]; // TODO: why isn't this the inferred type?
        if (keys.length != 1) {
            throw "bad thenToken call";
        }
        let key: keyof P = keys[0];
        let pattern = map[key];
        return this.thenWhen({
            [pattern as string]: (token: Token) => pure<{[k in keyof P]: Token}>({[key]: token} as any), // TODO: why does this need a cast?
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
    manyUntil(finish: TokenSelector): ParserFor<T[]> {
        return new ParserFor(stream => {
            let current = stream;
            let result: T[] = [];
            while (true) {
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
                            return p(stream.head()).run(stream.tail());
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

const parseType: ParserFor<Type> = new ParserFor(_ => null as any);

let parseConstraints: ParserFor<{constraints: Token[]}> = ParserFor.when({
    "is": ParserFor.when(
        {
            $name: (name: Token) => pure(name)
        },
        ParserFor.fail("expected constraint name")
    ).manyBetween("and").map(v => ({constraints: v}))
}, pure({constraints: []}));

let parseGeneric: ParserFor<Generic> = ParserFor.when({
    $name: (name: Token) => parseConstraints.merge({name}),
}, ParserFor.fail("expected generic parameter name"));

let parseGenerics: ParserFor<Generic[]> = ParserFor.when({
    "[": (open: Token) => 
        parseGeneric.manyBetween(",").thenWhen(
            {
                "]": pure({}),
            },
            ParserFor.fail(`expected ']' to close '[' opened at ${showToken(open)}`)
        ),
}, pure([])).map(x => {
    let array: Generic[] = [];
    for (let k in x) {
        array[k] = x[k];
    }
    return array;
});

function parseNamedType(name: Token): ParserFor<NamedType> {
    return ParserFor.when({
        "[": (open: Token) => parseType.manyBetween(",").thenWhen({
            "]": pure({}),
        }, ParserFor.fail(`expected ']' to close '[' opened at ${showToken(open)}`)).map(x => ({parameters: x}))
    }, pure({parameters: []})).merge<{type: "named", name: Token}>({type: "named", name});
}

const parseEffects: ParserFor<{effects: Token[]}> = ParserFor.when({
    "!": ParserFor.when({
        $name: (name: Token) => pure(name),
    }, ParserFor.fail(`expected effect name`)).manyBetween(',')
}, pure([])).map(effects => ({effects}));

const parseArgumentTypes: ParserFor<{arguments: Type[]}> = ParserFor.when({
    "(": (open: Token) => ParserFor.when(
        {
            ")": pure([]),
        },
        parseType.manyBetween(",").thenWhen(
            {
                ")": pure({}),
            },
            ParserFor.fail(`expected ')' to close '(' opened at ${showToken(open)}`)
        )
    )
}, ParserFor.fail(`expected function argument types`)).map(argumentTypes => ({arguments: argumentTypes}))

const parseReturnType: ParserFor<{returns: Type | null}> = ParserFor.when({
    "->": parseType.map(returns => ({returns}))
}, pure({returns: null}));

let parseFunctionType: ParserFor<FunctionType> = parseGenerics.map(generics => ({generics}))
    .then(parseEffects)
    .then(parseArgumentTypes)
    .then(parseReturnType)
    .merge<{type: "function"}>({type: "function"})  
;

let parsePureFunctionType: ParserFor<FunctionType> = parseGenerics.map(generics => ({generics}))
    .then(pure({effects: []}))
    .then(parseArgumentTypes)
    .then(parseReturnType)
    .merge<{type: "function"}>({type: "function"})  
;


// defined above as referenced, and updated down here to fix cyclical dependencies.
parseType.run = ParserFor.when({
    "func": parseFunctionType,
    "never": (never: Token) => pure<NeverType>({type: "never", never}),
    "self": (self: Token) => pure<SelfType>({type: "self", self}),
    "$name": parseNamedType,
}, ParserFor.fail("expected type")).run;

let parseStructField: ParserFor<{name: Token, type: Type}> = ParserFor.when({
    "var": ParserFor.when({
        $name: (name: Token) => ParserFor.when({
            ":": parseType.map(type => ({type})).thenWhen({
                ";": pure({})
            }, ParserFor.fail(`expected ';' to follow struct field type`))
        }, ParserFor.fail(`expected ':' to follow struct field name`))
        .merge({name})
    }, ParserFor.fail(`expected field name to follow 'var'`)),
    $name: (name: Token) => ParserFor.fail(`unexpected identifier ${showToken(name)}; perhaps you forgot 'var' to mark struct field`)
}, ParserFor.fail(`expected struct field declaration ('var')`));

let parseStructFields: ParserFor<{name: Token, type: Type}[]> = parseStructField.manyUntil("}");

let parseDeclareStruct: ParserFor<DeclareStruct> = ParserFor.when({
    $name: (name: Token) => parseGenerics.map(generics => ({generics}))
        .thenWhen({
            "{": matched( parseStructFields.map(fields => ({fields})) )
        }, ParserFor.fail(`expected '{' to open struct declaration`))
        .merge({name})
        .merge<{declare: "struct"}>({declare: "struct"})
}, ParserFor.fail("expected struct name"));

let parseEnumVariant: ParserFor<{name: Token, type: Type | null}> = ParserFor.when({
    "case": ParserFor.when({
        $name: (name: Token) => ParserFor.when({
            "of": parseType.map(type => ({type})).thenWhen({
                ";": pure({}),
            }, ParserFor.fail(`expected ';' to follow enum variant type`)),
            ";": pure({type: null}),
        }, ParserFor.fail(`expected ';' to follow enum variant name (or ':' to provide argument)`))
        .merge({name})
    }, ParserFor.fail(`expected variant name to follow 'case'`)),
    $name: (name: Token) => ParserFor.fail(`unexpected identifier ${showToken(name)}; perhaps you forgot 'case' to mark enum variant`)
}, ParserFor.fail(`expected enum variant declaration ('case')`));

let parseEnumVariants: ParserFor<{name: Token, type: Type | null}[]> = parseEnumVariant.manyUntil("}");

let parseDeclareEnum: ParserFor<DeclareEnum> = ParserFor.when({
    $name: (name: Token) => parseGenerics.map(generics => ({generics}))
        .thenWhen({
            "{": matched( parseEnumVariants.map(variants => ({variants})) )
        }, ParserFor.fail(`expected '{' to open enum declaration`))
        .merge({name})
        .merge<{declare: "enum"}>({declare: "enum"})
}, ParserFor.fail("expected enum name"));

let parseInterfaceMethod: ParserFor<{name: Token, type: FunctionType}> = ParserFor.when({
    "func": ParserFor.when({
        $name: (name: Token) => parseFunctionType
            .map(type => ({name, type}))
            .thenWhen({
                "}": pure({}),
            }, ParserFor.fail(`expected ';' after interface method declaration`))
    }, ParserFor.fail(`expected method name following 'func`))
}, ParserFor.fail(`expected interface method ('func')`));

let parseInterfaceMethods: ParserFor<{name: Token, type: FunctionType}[]> = parseInterfaceMethod.manyUntil("}");

let parseDeclareInterface: ParserFor<DeclareInterface> = ParserFor.when({
    $name: (name: Token) => ParserFor.when({
        "extends": parseConstraints.map(x => ({parents: x.constraints}))
    }, pure<{parents: Token[]}>({parents: []})).thenWhen({
        "{": (open: Token) => parseInterfaceMethods.map(methods => ({methods})).thenWhen({
            "}": pure({})
        }, ParserFor.fail(`expected '}' to close '{' opened at ${showToken(open)}`))
    },  ParserFor.fail(`expected '{' to open body of interface`))
    .merge({name})
}, ParserFor.fail(`expected interface name`)).merge<{declare: "interface"}>({declare: "interface"});

let parseEffectAction: ParserFor<{name: Token, type: FunctionType}> = ParserFor.when({
    "func": ParserFor.when({
        $name: (name: Token) => ParserFor.when({
            "!": pure({})
        }, ParserFor.fail(`expected '!' to follow action name`)).then( parsePureFunctionType
            .map(type => ({name, type}))
            .thenWhen({
                "}": pure({}),
            }, ParserFor.fail(`expected ';' after effect action declaration`))
        )
    }, ParserFor.fail(`expected action name following 'func`))
}, ParserFor.fail(`expected effect action ('func')`));

let parseEffectActions: ParserFor<{name: Token, type: FunctionType}[]> = parseEffectAction.manyUntil("}");

let parseDeclareEffect: ParserFor<DeclareEffect> = ParserFor.when({
    $name: (name: Token) => ParserFor.when({
        "{": (open: Token) => parseEffectActions.map(actions => ({actions})).thenWhen({
            "}": pure({})
        }, ParserFor.fail(`expected '}' to close '{' opened at ${showToken(open)}`))
    },  ParserFor.fail(`expected '{' to open body of interface`))
    .merge({name})
}, ParserFor.fail(`expected effect name`)).merge<{declare: "effect"}>({declare: "effect"});

let parseArgument: ParserFor<{name: Token, type :Type}> = ParserFor.when({
    $name: (name: Token) => pure({name})
}, ParserFor.fail(`expected argument name`)).thenWhen({
    ":": pure({}),
}, ParserFor.fail(`expected ':' to follow argument name`)).thenIn({type: parseType})

let parseArguments: ParserFor<{name: Token, type: Type}[]> = ParserFor.when({
    "(": (open: Token) => parseArgument.manyUntil(")").thenWhen({
        ")": pure({})
    }, ParserFor.fail(`expected ')' to close '(' opened at ${showToken(open)}`))
}, pure([]))

let parseBlock: ParserFor<Statement[]> = new ParserFor(null as any);

let parseDeclareFunction: ParserFor<DeclareFunction> = ParserFor.when({
    $name: (name: Token) => pure({name})
}, ParserFor.fail(`expected function name to follow 'func'`))
    .thenIn({generics: parseGenerics})
    .then(parseEffects)
    .thenIn({arguments: parseArguments})
    .then(parseReturnType)
    .thenIn({body: parseBlock})
    .merge<{declare: "function"}>({declare: "function"});

let parseDeclareService: ParserFor<DeclareService> = ParserFor.fail(`TODO: services are not yet supported`);

let parseDeclare: ParserFor<Declare> = ParserFor.when({
    "func": parseDeclareFunction,
    "service": parseDeclareService,
    "struct": parseDeclareStruct,
    "enum": parseDeclareEnum,
    "interface": parseDeclareInterface,
    "effect": parseDeclareEffect,
}, ParserFor.fail(`expected top-level declaration`));

// The stream function is assigned below.
// This extra indirection allows it to be defined recursively.
let parseExpression: ParserFor<Expression> = new ParserFor(null as any);
let parseStatement: ParserFor<Statement> = new ParserFor(null as any);

let parseObjectField: ParserFor<{name: Token, value: Expression}> = ParserFor.when({
    $name: (name: Token) => ParserFor.when({
        "=>": parseExpression.map(value => ({name, value})),
    }, ParserFor.fail(`expected '=>' to follow field name`))
}, ParserFor.fail(`expected field name`));

let parseExpressionAtom: ParserFor<Expression> = ParserFor.when({
    $name: (variable: Token) => pure<VariableExpression>({expression: "variable", variable}),
    $integer: (integer: Token) => pure<IntegerExpression>({expression: "integer", token: integer}),
    $string: (string: Token) => pure<StringExpression>({expression: "string", token: string}),
    "(": (open: Token) => parseExpression.thenWhen({
        ")": pure({}),
    }, ParserFor.fail(`expected ")" to close "(" opened at ${showToken(open)}`)),
    "#": (hash: Token) => ParserFor.when({
        $name: (name: Token) => ParserFor.when({
            "{": (open: Token) => ParserFor.when(
                {
                    "}": pure<ObjectExpression>({expression: "object", name, fields: []})
                },
                parseObjectField.manyBetween(",").thenWhen({
                    "}": pure({}),
                }, ParserFor.fail(`expected '}' to close ${showToken(open)}`)).map((fields): ObjectExpression => {
                    return {expression: "object", name, fields};
                })
            ),
            // TODO: named arrays and associative maps
        }, ParserFor.fail(`expected '{' to follow constructor name`)),
        "[": (open: Token) => ParserFor.when(
            {
                "]": pure<ArrayExpression>({expression: "array", name: null, items: []}),
            },
            parseExpression.manyBetween(",").thenWhen({
                "]": pure({}),
            }, ParserFor.fail(`expected ']' to close array`)).map((items): ArrayExpression => {
                return {expression: "array", name: null, items};
            }),
        ),
    }, ParserFor.fail(`expected constructor name or array literal to follow '#'`)),
    // TODO: 'use' for service
    // TODO: function expressions
}, ParserFor.fail(`expected expression`));

type ExpressionSuffix = {suffix: "call", arguments: Expression[]} | {suffix: "bang", arguments: Expression[]} | {suffix: "cast", into: Type} | {suffix: "field", field: Token}

// A suffix binds tightly to its atomic expression.
let parseExpressionSuffix: ParserFor<ExpressionSuffix | null> = ParserFor.when({
    "(": matched(parseExpression.manyUntil(")").map(item => {
        return {suffix: "call" as "call", arguments: item};
    })),
    "!": ParserFor.when({
        "(": matched(parseExpression.manyUntil(")").map(item => {
            return {suffix: "bang", arguments: item};
        })),
    }, ParserFor.fail(`expected '(' to begin function call after '!'`)),
    // TODO: bang call
    ".": (dot: Token) => ParserFor.when({
        $name: (field: Token) => ({suffix: "field" as "field", field}),
    }, ParserFor.fail(`expected field name to follow '.' at ${showToken(dot)}`)),
    // TODO: cast expression
}, pure(null));

let parseExpressionSuffixes: ParserFor<ExpressionSuffix[]> = parseExpressionSuffix.thenInstead(first => {
    if (first == null) {
        return pure([]);
    }
    return parseExpressionSuffixes.map(remaining => [first].concat(remaining));
});

let parseExpressionChained: ParserFor<Expression> = parseExpressionAtom.map(expression => ({base: expression})).thenIn({suffixes: parseExpressionSuffixes}).map((chain: {base: Expression, suffixes: ExpressionSuffix[]}) => {
    let base = chain.base;
    for (let suffix of chain.suffixes) {
        switch (suffix.suffix) {
        case "call":
            base = {
                expression: "call",
                hasEffect: false,
                function: base,
                arguments: suffix.arguments,
            };
            break;
        case "bang":
            base = {
                expression: "call",
                hasEffect: true,
                function: base,
                arguments: suffix.arguments,
            };
            break;
        case "cast":
            throw "TODO: implement cast expressions"
        case "field":
            base = {
                expression: "dot",
                object: base,
                field: suffix.field,
            };
            break;
        default:
            let impossible: never = suffix;
        }
    }
    return base;
});

function infixOperatorParser(base: ParserFor<Expression>, operators: string[], direction: "left" | "right"): ParserFor<Expression> {
    let intitial = base;
    let suffixParser = base.manyWhen(operators);
    return intitial.map(base => ({base})).thenIn({suffixes: suffixParser}).map(branch => {
        if (branch.suffixes.length == 0) {
            return branch.base;
        }
        if (direction == "left") {
            let combined = branch.base;
            for (let i = 0; i < branch.suffixes.length; i++) {
                combined = {
                    expression: "operator",
                    operator: branch.suffixes[i].lead,
                    left: combined,
                    right: branch.suffixes[i].item,
                };
            }
            return combined;
        } else {
            let combined = branch.suffixes[branch.suffixes.length-1].item;
            for (let i = branch.suffixes.length-2; i >= 0; i--) {
                combined = {
                    expression: "operator",
                    operator: branch.suffixes[i+1].lead,
                    left: branch.suffixes[i].item,
                    right: combined,
                };
            }
            combined = {
                expression: "operator",
                operator: branch.suffixes[0].lead,
                left: branch.base,
                right: combined,
            };
            return combined;
        }
    });
}

// TODO: non-associative operators (comparison, "^")
// TODO: prefix operators

let parseExpressionOperator05 = infixOperatorParser(parseExpressionChained, ["^"], "right");
let parseExpressionOperator10 = infixOperatorParser(parseExpressionOperator05, ["*", "/", "%"], "left");
let parseExpressionOperator20 = infixOperatorParser(parseExpressionOperator10, ["+", "-"], "left");
let parseExpressionOperator30 = infixOperatorParser(parseExpressionOperator20, ["++"], "right");
let parseExpressionOperator35 = infixOperatorParser(parseExpressionOperator30, ["<>"], "right");
let parseExpressionOperator40 = infixOperatorParser(parseExpressionOperator35, ["==", "/=", "<", ">", "<=", ">="], "left");
let parseExpressionOperator50 = infixOperatorParser(parseExpressionOperator40, ["and"], "left");
let parseExpressionOperator60 = infixOperatorParser(parseExpressionOperator50, ["or"], "left");

parseExpression.run = (stream) => parseExpressionOperator60.run(stream);

// TODO: statements

let parseBlockInternal: ParserFor<Block> = ParserFor.when({
    "{": (open: Token) => parseStatement.manyUntil("}").thenWhen({
        "}": pure({}),
    }, ParserFor.fail(`expected "}" to close block opened at ${showToken(open)}`))
}, ParserFor.fail(`expected "{" to open block`));
parseBlock.run = (stream) => parseBlockInternal.run(stream);

let parseStatementInternal: ParserFor<Statement> = ParserFor.when({
    "if": pure<{statement: "if"}>({statement: "if"})
        .thenIn({condition: parseExpression})
        .thenIn({thenBlock: parseBlock})
        .thenWhen({
            "else": pure({})
                .thenIn({elseBlock: parseBlock}),
        },
            pure({elseBlock: null})
        ),
    "while": pure<{statement: "while"}>({statement: "while"})
        .thenIn({condition: parseExpression})
        .thenIn({bodyBlock: parseBlock}),
    "var": pure<{statement: "var"}>({statement: "var"})
        .thenToken({name: "$name"}, `expected variable name`)
        .thenToken({"_": ":"}, `expected ':' to follow variable name`)
        .thenIn({type: parseType})
        .thenToken({"_": "="}, `expected '=' to follow variable declaration (TODO: future Bismuth versions will lift this restriction)`)
        .thenIn({expression: parseExpression})
        .thenToken({"_": ";"}, `expected ';' to end variable declarations`),
    "break": pure<{statement: "break"}>({statement: "break"})
        .thenToken({"_": ";"}, `expected ';' to follow break`),
    "continue": pure<{statement: "continue"}>({statement: "continue"})
        .thenToken({"_": ";"}, `expected ';' to follow continue`),
    "return": pure<{statement: "return"}>({statement: "return"})
        .thenWhen({
            ";": pure({expression: null}),
        }, pure({}).thenIn({expression: parseExpression}).thenToken({"_": ";"}, `expected ';' to follow return expression`)),
},
    pure({}).thenIn({expression: parseExpression}).thenInstead(({expression}) => {
        return ParserFor.when({
            ";": pure<{statement: "expression", expression: Expression}>({statement: "expression", expression}),
            "=": parseExpression.map(rhs => {
                const assignStatement: AssignStatement = {statement: "assign", lhs: expression, rhs};
                return assignStatement;
            })
        }, ParserFor.fail(`expected ';' or '=' to follow expression-as-statement`));
    })
);

parseStatement.run = (stream) => parseStatementInternal.run(stream);

let parseModule: ParserFor<Declare[]> = parseDeclare.manyUntil("$end");

type ExpressionRef
    = Ref<"ExpressionInteger">
    | Ref<"ExpressionString">
    | Ref<"ExpressionVariable">
    | Ref<"ExpressionDot">
    | Ref<"ExpressionCall">
    | Ref<"ExpressionObject">
    | Ref<"ExpressionArray">
    | Ref<"ExpressionOperator">

type TypeRef
    = Ref<"TypeName">
    | Ref<"TypeFunction">

type ReferenceRef
    = Ref<"ReferenceVar">
    | Ref<"ReferenceDot">

type StatementRef
    = Ref<"StatementDo">
    | Ref<"StatementVar">
    | Ref<"StatementAssign">
    | Ref<"StatementReturn">
    | Ref<"StatementBreak">
    | Ref<"StatementContinue">
    | Ref<"StatementBlock">

type DeclareRef
    = Ref<"DeclareBuiltinType">
    | Ref<"DeclareStruct">
    | Ref<"DeclareEnum">
    | Ref<"DeclareGeneric">
    | Ref<"DeclareFunction">
    | Ref<"DeclareVar">

// the ProgramGraph is a graph representation of the AST.
type ProgramGraph = { // an expression node is just like an expression, except it has Ref<"Expression"> instead of Expression as a child
    // TODO: service, function
    ExpressionInteger: {type: "integer", value: Token},
    ExpressionString: {type: "string", value: Token},
    ExpressionVariable: {type: "variable", variable: Token, scope: Ref<"Scope">},
    ExpressionDot: {type: "dot", object: ExpressionRef, field: Token},
    ExpressionCall: {type: "call", hasEffect: boolean, func: ExpressionRef, arguments: ExpressionRef[]},
    ExpressionObject: {type: "object", name: Token, fields: {name: Token, value: ExpressionRef}[], scope: Ref<"Scope">},
    ExpressionArray: {type: "array", fields: ExpressionRef[]},
    ExpressionOperator: {type: "operator", operator: Token, left: ExpressionRef | null, right: ExpressionRef},
    // TODO: map/array access
    ReferenceVar: {type: "variable", name: Token, scope: Ref<"Scope">},
    ReferenceDot: {type: "dot", object: ReferenceRef, field: Token},
    // TODO: if/while/etc
    StatementDo: {is: "do", expression: ExpressionRef},
    StatementVar: {is: "var", declare: Ref<"DeclareVar">, expression: ExpressionRef},
    StatementAssign: {is: "assign", reference: ReferenceRef, expression: ExpressionRef},
    StatementReturn: {is: "return", expression: null | ExpressionRef},
    StatementBreak: {is: "break"},
    StatementContinue: {is: "continue"},
    StatementBlock: {is: "block", body: StatementRef[]},

    TypeName: {type: "name", name: Token, parameters: TypeRef[], scope: Ref<"Scope">},
    TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[] , returns: TypeRef | null},

    DeclareBuiltinType: {declare: "builtin-type", name: {text: string, location: "<builtin>"}, parameterCount: number}, // TODO: constraints on parameters?
    DeclareGeneric: {declare: "generic", name: Token, constraints: never[]}, // TODO: constraints
    DeclareStruct: {declare: "struct", name: Token, generics: Ref<"DeclareGeneric">[], fields: {name: Token, type: TypeRef}[]},
    DeclareEnum: {declare: "enum", name: Token, generics: Ref<"DeclareGeneric">[], variants: {name: Token, type: TypeRef | null}[]},
    DeclareFunction: {declare: "function", name: Token, effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: Ref<"DeclareVar">[], returns: TypeRef | null, body: Ref<"StatementBlock">},
    DeclareVar: {declare: "var", name: Token, type: TypeRef},

    Scope: {
        parent: Ref<"Scope"> | null,
        inScope: {[name: string]: DeclareRef},
    }
};

function compile(source: string) {
    try {
        let lexed = lex(source);
        if (lexed instanceof ParseError) {
            console.log("error lexing:", lexed);
            return;
        }
        console.log(lexed);
        let declarations = parseModule.run(new TokenStream(lexed));
        let graph = new GraphOf<ProgramGraph>({ // TODO: do this lazily so that it's hidden
            ExpressionInteger: {},
            ExpressionString: {},
            ExpressionVariable: {},
            ExpressionDot: {},
            ExpressionCall: {},
            ExpressionObject: {},
            ExpressionArray: {},
            ExpressionOperator: {},
            ReferenceVar: {},
            ReferenceDot: {},
            StatementDo: {},
            StatementVar: {},
            StatementAssign: {},
            StatementReturn: {},
            StatementBreak: {},
            StatementContinue: {},
            StatementBlock: {},
            TypeName: {},
            TypeFunction: {},
            DeclareBuiltinType: {},
            DeclareStruct: {},
            DeclareEnum: {},
            DeclareGeneric: {},
            DeclareFunction: {},
            DeclareVar: {},
            Scope: {},
        });
        function graphyType(t: Type, scope: Ref<"Scope">): TypeRef {
            if (t.type == "named") {
                // TODO: parameters
                return graph.insert("TypeName", {
                    type: "name",
                    name: t.name,
                    parameters: t.parameters.map(p => graphyType(p, scope)),
                    scope,
                });
            } else if (t.type == "function") {
                return graph.insert("TypeFunction", {
                    type: "function",
                    effects: t.effects,
                    generics: t.generics.map(generic => graph.insert("DeclareGeneric", {
                        declare: "generic",
                        name: generic.name,
                        constraints: [], // TODO: do these properly
                    })),
                    arguments: t.arguments.map(a => graphyType(a, scope)),
                    returns: t.returns ? graphyType(t.returns, scope) : null,
                });
            } else {
                throw {message: "not implemented - graphyType", t};
            }
        }
        function graphyExpression(e: Expression, scope: Ref<"Scope">): ExpressionRef {
            if (e.expression == "string") {
                return graph.insert("ExpressionString", {
                    type: "string",
                    value: e.token,
                });
            } else if (e.expression == "integer") {
                return graph.insert("ExpressionInteger", {
                    type: "integer",
                    value: e.token,
                });
            } else if (e.expression == "variable") {
                return graph.insert("ExpressionVariable", {
                    type: "variable",
                    variable: e.variable,
                    scope: scope,
                });
            } else if (e.expression == "dot") {
                return graph.insert("ExpressionDot", {
                    type: "dot",
                    object: graphyExpression(e.object, scope),
                    field: e.field,
                });
            } else if (e.expression == "call") {
                return graph.insert("ExpressionCall", {
                    type: "call",
                    hasEffect: e.hasEffect,
                    func: graphyExpression(e.function, scope),
                    arguments: e.arguments.map(a => graphyExpression(a, scope)),
                });
            } else if (e.expression == "object") {
                return graph.insert("ExpressionObject", {
                    type: "object",
                    name: e.name,
                    fields: e.fields.map(({name, value}) => ({name, value: graphyExpression(value, scope)})),
                    scope: scope,
                })
            } else if (e.expression == "array") {
                return graph.insert("ExpressionArray", {
                    type: "array",
                    fields: e.items.map(item => graphyExpression(item, scope)),
                })
            } else if (e.expression == "operator") {
                return graph.insert("ExpressionOperator", {
                    type: "operator",
                    operator: e.operator,
                    left: graphyExpression(e.left, scope),
                    right: graphyExpression(e.right, scope),
                });
            } else if (e.expression == "prefix") {
                return graph.insert("ExpressionOperator", {
                    type: "operator",
                    operator: e.operator,
                    left: null,
                    right: graphyExpression(e.right, scope),
                });
            }
            throw {message: "not implemented - graphyExpression", e};
        }
        function graphyReference(r: Expression, scope: Ref<"Scope">): ReferenceRef {
            if (r.expression == "variable") {
                return graph.insert("ReferenceVar", {
                    type: "variable",
                    name: r.variable,
                    scope: scope,
                });
            } else if (r.expression == "dot") {
                return graph.insert("ReferenceDot", {
                    type: "dot",
                    object: graphyReference(r.object, scope),
                    field: r.field,
                });
            }
            throw {message: `expression ${r.expression} cannot be used as a reference`, r};
        }
        function graphyStatement(s: Statement, parent: Ref<"Scope">): {ref: StatementRef, nextScope: null | Ref<"Scope">} {
            if (s.statement == "var") {
                let declare = graph.insert("DeclareVar", {
                    declare: "var",
                    name: s.name,
                    type: graphyType(s.type, parent),
                });
                let subscope = graph.insert("Scope", {
                    parent: parent,
                    inScope: { [s.name.text]: declare },
                });
                return {
                    ref: graph.insert("StatementVar", {
                        is: "var",
                        declare: declare,
                        expression: graphyExpression(s.expression, parent),
                    }),
                    nextScope: subscope,
                };
            } else if (s.statement == "assign") {
                return {
                    ref: graph.insert("StatementAssign", {
                        is: "assign",
                        reference: graphyReference(s.lhs, parent),
                        expression: graphyExpression(s.rhs, parent),
                    }),
                    nextScope: null,
                };
            } else if (s.statement == "return") {
                return {
                    ref: graph.insert("StatementReturn", {
                        is: "return",
                        expression: s.expression ? graphyExpression(s.expression, parent) : null,
                    }),
                    nextScope: null,
                };
            } else if (s.statement == "expression") {
                return {
                    ref: graph.insert("StatementDo", {
                        is: "do",
                        expression: graphyExpression(s.expression, parent),
                    }),
                    nextScope: null,
                }
            } else if (s.statement == "break") {
                return {
                    ref: graph.insert("StatementBreak", {is: "break"}),
                    nextScope: null,
                };
            } else if (s.statement == "continue") {
                return {
                    ref: graph.insert("StatementContinue", {is: "continue"}),
                    nextScope: null,
                };
            }
            // TODO: include returns, etc.
            throw {message: "not implemented - graphyStatement", s};
        }
        function graphyBlock(body: Statement[], scope: Ref<"Scope">): Ref<"StatementBlock"> {
            let children: StatementRef[] = [];
            let currentScope = scope;
            for (let s of body) {
                let {ref, nextScope} = graphyStatement(s, currentScope);
                children.push(ref);
                if (nextScope) {
                    currentScope = nextScope;
                }
            }
            return graph.insert("StatementBlock", {
                is: "block",
                body: children,
            });
        }
        console.log("parsed:", declarations);

        const builtins = {
            "Int": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: {text:"Int", location: "<builtin>"}, parameterCount: 0}),
            "Unit": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: {text:"Unit", location: "<builtin>"}, parameterCount: 0}),
            "String": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: {text:"String", location: "<builtin>"}, parameterCount: 0}),
            "Array": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: {text:"Array", location: "<builtin>"}, parameterCount: 1}),
        };
        const builtinScope = graph.insert("Scope", {parent: null, inScope: builtins});

        const builtinTypeNames = {
            "Int": graph.insert("TypeName", {type: "name", name: {type: "special", text: "Int", location: "<builtin>"}, parameters: [], scope: builtinScope}),
            "Unit": graph.insert("TypeName", {type: "name", name: {type: "special", text: "Unit", location: "<builtin>"}, parameters: [], scope: builtinScope}),
            "String": graph.insert("TypeName", {type: "name", name: {type: "special", text: "String", location: "<builtin>"}, parameters: [], scope: builtinScope}),
        };

        // in scope will be updated later
        let globalScope = graph.insert("Scope", {parent: builtinScope, inScope: {}});
        for (let declaration of declarations.result) {
            if (declaration.declare == "struct") {
                let struct = declaration;
                let generics = struct.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    constraints: [],
                }));
                let inScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (graph.get(generic).name.text in inScope) {
                        throw `generic variable '${graph.get(generic).name.text}' is redeclared at ${graph.get(generic).name.location}`;
                    }
                    inScope[graph.get(generic).name.text] = generic;
                }
                let scope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                let refTo = graph.insert("DeclareStruct", {
                    declare:  "struct",
                    name:     declaration.name,
                    generics: generics,
                    fields:   struct.fields.map(field => ({name: field.name, type: graphyType(field.type, scope)})),
                });
                if (struct.name.text in graph.get(globalScope).inScope) {
                    throw `struct with name '${struct.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[struct.name.text]).name.location} but declared again at ${struct.name.location}`;
                }
                graph.get(globalScope).inScope[struct.name.text] = refTo;
            } else if (declaration.declare == "enum") {
                let alternates = declaration;
                let generics = alternates.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    constraints: [], // TODO
                }));
                let inScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (graph.get(generic).name.text in inScope) {
                        throw `generic variable '${graph.get(generic).name.text}' is redeclared at ${graph.get(generic).name.location}`;
                    }
                    inScope[graph.get(generic).name.text] = generic;
                }
                let scope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                let refTo = graph.insert("DeclareEnum", {
                    declare:  "enum",
                    name:     declaration.name,
                    generics: generics,
                    variants:   alternates.variants.map(variant => ({name: variant.name, type: variant.type ? graphyType(variant.type, scope) : null})),
                });
                if (alternates.name.text in graph.get(globalScope).inScope) {
                    throw `enum with name '${alternates.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[alternates.name.text]).name.location} but declared again at ${alternates.name.location}`;
                }
                graph.get(globalScope).inScope[alternates.name.text] = refTo;
            } else if (declaration.declare == "function") {
                let func = declaration;
                let generics = func.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    constraints: [], // TODO
                }));
                let genericsInScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (graph.get(generic).name.text in genericsInScope) {
                        throw `generic '${graph.get(generic).name.text}' at ${graph.get(generic).name.location} was already declared`;
                    }
                    genericsInScope[graph.get(generic).name.text] = generic;
                }
                let genericScope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: genericsInScope,
                })
                // next, the arguments.
                let args = func.arguments.map(arg => graph.insert("DeclareVar", {
                    declare: "var",
                    name: arg.name,
                    type: graphyType(arg.type, genericScope),
                }));
                let argsInScope: {[name: string]: Ref<"DeclareVar">} = {};
                for (let arg of args) {
                    if (graph.get(arg).name.text in argsInScope) {
                        throw `argument '${graph.get(arg).name.text} at ${graph.get(arg).name.location} was already declared`;
                    }
                    argsInScope[graph.get(arg).name.text] = arg;
                }
                let argScope = graph.insert("Scope", {
                    parent: genericScope,
                    inScope: argsInScope,
                });
                // TODO: effects
                let refTo = graph.insert("DeclareFunction",  {
                    declare: "function",
                    name: func.name,
                    effects: func.effects,
                    generics: generics,
                    arguments: args,
                    returns: func.returns ? graphyType(func.returns, argScope) : null,
                    body: graphyBlock(func.body, argScope),
                });
                if (func.name.text in graph.get(globalScope).inScope) {
                    throw `global with name '${func.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[func.name.text]).name.location} but declared again as function at ${func.name.location}`;
                }
                graph.get(globalScope).inScope[func.name.text] = refTo;
            } else {
                throw "unimplemented declaration";
            }
        }
        

        function lookupScope(graph: GraphOf<{Scope: ProgramGraph["Scope"]}>, scope: Ref<"Scope">, name: string): DeclareRef | null {
            let reference = graph.get(scope);
            if (name in reference.inScope) {
                return reference.inScope[name];
            }
            return reference.parent ? lookupScope(graph, reference.parent, name) : null;
        }

        // first, perform kind-checking.
        const graphK = graph.compute({
            TypeName: {
                typeDeclaration: (named: ProgramGraph["TypeName"]): Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareGeneric"> | Ref<"DeclareBuiltinType"> => {
                    const lookup = lookupScope(graph, named.scope, named.name.text);
                    if (!lookup) {
                        throw `type name '${named.name.text}' at ${named.name.location} is not in scope.`;
                    }
                    if (lookup.type == "DeclareBuiltinType") {
                        const declaration = graph.get(lookup);
                        if (named.parameters.length != declaration.parameterCount) {
                            throw `builtin type '${named.name.text}' at ${named.name.location} expects ${declaration.parameterCount} generic parameters but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareStruct") {
                        const declaration = graph.get(lookup);
                        if (named.parameters.length != declaration.generics.length) {
                            throw `struct type '${named.name.text}' referenced at ${named.name.location} expects ${declaration.generics.length} generic parameters (defined at ${declaration.name.location}) but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareEnum") {
                        const declaration = graph.get(lookup);
                        if (named.parameters.length != declaration.generics.length) {
                            throw `struct type '${named.name.text}' referenced at ${named.name.location} expects ${declaration.generics.length} generic parameters (defined at ${declaration.name.location}) but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareGeneric") {
                        const declaration = graph.get(lookup);
                        if (named.parameters.length != 0) {
                            throw `generic type '${named.name.text}' at ${named.name.location} cannot take generic parameters`;
                        }
                        return lookup;
                    } else {
                        throw `'${named.name.text}' at ${named.name.location} does not name a type, it is a ${lookup.type}`;
                    }
                },
            },
        });
        // next, we'll need to resolve identifiers so that they point to the appropriate places.
        const graphN = graphK.compute<{ExpressionVariable: {variableDeclaration: Ref<"DeclareVar"> | Ref<"DeclareFunction">}}>({
            ExpressionVariable: {
                variableDeclaration: (self, result): Ref<"DeclareVar"> | Ref<"DeclareFunction"> => {
                    const lookup = lookupScope(result, self.scope, self.variable.text);
                    if (!lookup) {
                        console.log(result, self.scope);
                        throw `variable name '${self.variable.text}' at ${self.variable.location} is not in scope.`;
                    }
                    if (lookup.type == "DeclareVar") {
                        return lookup;
                    }
                    if (lookup.type == "DeclareFunction") {
                        return lookup;
                    }
                    console.log(self.scope, result);
                    throw `'${self.variable.text}' does not name a variable or function at ${self.variable.location}`;
                },
            },
        });
        
        function typeIdentical(t1: TypeRef, t2: TypeRef, g: typeof graphK, equal: ReadonlyArray<{a: Ref<"DeclareGeneric">, b: Ref<"DeclareGeneric">}> = []): boolean {
            if (t1 == t2) {
                return true;
            }
            if (t1.type == "TypeName") {
                if (t2.type != "TypeName") {
                    return false;
                }
                const n1 = g.get(t1);
                const n2 = g.get(t2);
                if (n1.typeDeclaration != n2.typeDeclaration) {
                    return false;
                }
                for (let i = 0; i < n1.parameters.length; i++) {
                    if (!typeIdentical(n1.parameters[i], n2.parameters[i], g, equal)) {
                        return false;
                    }
                }
                return true;
            } else if (t1.type == "TypeFunction") {
                if (t2.type != "TypeFunction") {
                    return false;
                }
                const f1 = g.get(t1);
                const f2 = g.get(t2);
                if (f1.generics.length != f2.generics.length) {
                    return false;
                }
                if (f1.arguments.length != f2.arguments.length) {
                    return false;
                }
                const combinedEqual = equal.concat( f1.generics.map((_, i) => ({a: f1.generics[i], b: f2.generics[i]})));
                // TODO: check the constraints
                for (let i = 0; i < f1.arguments.length; i++) {
                    if (!typeIdentical(f1.arguments[i], f2.arguments[i], g, combinedEqual)) {
                        return false;
                    }
                }
                // TODO: handle null returns as equivalent to unit
                if (f1.returns == null) {
                    return f2.returns == null;
                }
                if (f2.returns == null) {
                    return false;
                }
                return typeIdentical(f1.returns, f2.returns, g, combinedEqual);
            } else {
                const impossible: never = t1;
                return impossible;
            }
        }

        function typeSubstitute(t: TypeRef, g: typeof graphK, variables: Map<Ref<"DeclareGeneric">, TypeRef>): TypeRef {
            if (t.type == "TypeName") {
                const n = g.get(t);
                if (n.typeDeclaration.type == "DeclareGeneric" && variables.has(n.typeDeclaration)) {
                    if (n.parameters.length != 0) {
                        throw "compiler error; generic has type parameters";
                    }
                    return variables.get(n.typeDeclaration)!;
                }
                return g.insert("TypeName", {
                    type: "name",
                    name: n.name,
                    parameters: n.parameters.map(p => typeSubstitute(p, g, variables)),
                    scope: n.scope,
                    typeDeclaration: n.typeDeclaration,
                });
            } else if (t.type == "TypeFunction") {
                const f = g.get(t);
                return g.insert("TypeFunction", {
                    type: "function",
                    effects: f.effects,
                    generics: f.generics,
                    arguments: f.arguments.map(a => typeSubstitute(a, g, variables)),
                    returns: f.returns ? typeSubstitute(f.returns, g, variables) : null,
                });
            } else {
                const impossible: never = t;
                return impossible;
            }
        }

        function matchType(unified: Map<Ref<"DeclareGeneric">, TypeRef[]>, result: typeof graphT, pattern: TypeRef, against: TypeRef, equivalent: Map<Ref<"DeclareGeneric">, Ref<"DeclareGeneric">>): true | string {
            if (pattern.type == "TypeName") {
                const patternName = result.get(pattern);
                if (patternName.typeDeclaration.type == "DeclareGeneric" && unified.has(patternName.typeDeclaration)) {
                    unified.get(patternName.typeDeclaration)!.push(against);
                    return true;
                }
                if (patternName.typeDeclaration.type == "DeclareGeneric" && equivalent.has(patternName.typeDeclaration)) {
                    if (against.type == "TypeName" && result.get(against).typeDeclaration == equivalent.get(patternName.typeDeclaration)!) {
                        return true;
                    }
                    return `cannot match ${prettyType(against, result)} against expected ${prettyType(pattern, result)}; generic parameters must occur in the same order and be used identically`;
                }
                if (against.type != "TypeName") {
                    return `cannot match '${prettyType(against, result)}' type argument against expected '${prettyType(pattern, result)}'`;
                }
                const againstName = result.get(against);
                if (patternName.typeDeclaration != againstName.typeDeclaration) {
                    return `cannot match type '${prettyType(against, result)}' against expected '${prettyType(pattern, result)}'`;
                }
                for (let i = 0; i < againstName.parameters.length; i++) {
                    let ok = matchType(unified, result, patternName.parameters[i], againstName.parameters[i], equivalent);
                    if (ok !== true) {
                        return ok;
                    }
                }
                return true;
            } else if (pattern.type == "TypeFunction") {
                if (against.type != "TypeFunction") {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                const patternFunction = result.get(pattern);
                const againstFunction = result.get(against);
                if (patternFunction.arguments.length != againstFunction.arguments.length) {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                if (patternFunction.generics.length != againstFunction.generics.length) {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)} because they have differing parametericity`;
                }
                const newEquivalent = new Map<Ref<"DeclareGeneric">, Ref<"DeclareGeneric">>();
                for (let [e1, e2] of equivalent) {
                    newEquivalent.set(e1, e2);
                }
                for (let i = 0; i < patternFunction.generics.length; i++) {
                    // add equivalency for the generics.
                    // note: this means that their order matters.
                    newEquivalent.set(patternFunction.generics[i], againstFunction.generics[i]);
                }
                for (let i = 0; i < patternFunction.arguments.length; i++) {
                    let m = matchType(unified, result, patternFunction.arguments[i], againstFunction.arguments[i], newEquivalent);
                    if (m !== true) {
                        return m;
                    }
                }
                if (!patternFunction.returns) {
                    if (againstFunction.returns) {
                        return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                    }
                    return true; // all matching
                }
                if (!againstFunction.returns) {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                // both exists
                return matchType(unified, result, patternFunction.returns, againstFunction.returns, newEquivalent);
            } else {
                const impossible: never = pattern;
                return impossible;
            }
        }

        const expectedType = new Map<ExpressionRef, TypeRef>();
        graphN.each("StatementVar", s => {
            expectedType.set(s.expression, graphN.get(s.declare).type);
        });

        function prettyType(t: TypeRef, g: typeof graph): string {
            const ts = g.get(t);
            if (ts.type == "name") {
                if (ts.parameters.length == 0) {
                    return ts.name.text;
                } else {
                    return ts.name.text + "[" + ts.parameters.map(p => prettyType(p, g)).join(", ") + "]";
                }
            } else if (ts.type == "function") {
                return "func(" + ts.arguments.map(a => prettyType(a, g)).join(", ") + ")" + (ts.returns ? "->" + prettyType(ts.returns, g) : "");
            } else {
                const impossible: never = ts;
                return impossible;
            }
        }
        function prettyExpression(e: ExpressionRef, g: typeof graph): string {
            const es = g.get(e);
            if (es.type == "string") {
                return `${es.value.text}`;
            } else if (es.type == "object") {
                return `#${es.name.text}{ ${es.fields.map(({name, value}) => name.text + " => " + prettyExpression(value, g) + ",").join(" ")} }`
            } else if (es.type == "integer") {
                return `${es.value.text}`;
            } else if (es.type == "variable") {
                return `${es.variable.text}`;
            } else if (es.type == "dot") {
                return `${prettyExpression(es.object, g)}.${es.field.text}`;
            } else if (es.type == "call") {
                return `${prettyExpression(es.func, g)}${es.hasEffect ? "!" : ""}(${es.arguments.map(a => prettyExpression(a, g)).join(", ")})`;
            } else if (es.type == "array") {
                return `#[${es.fields.map(f => prettyExpression(f, g)).join(", ")}]`
            } else if (es.type == "operator") {
                if (es.left) {
                    return `(${prettyExpression(es.left, g)} ${es.operator.text} ${prettyExpression(es.right, g)})`
                }
                return `(${es.operator.text} ${prettyExpression(es.right, g)})`
            } else {
                const impossible: never = es;
                return impossible;
            }
        }
        

        // TODO: in order to support partial inference,
        // change this to a 2-pass or n-pass scheme, where some types have values inferred,
        // while others create expectations for their children.
        // This allows us to (for example) handle ```var x: Int = read("5");```
        // which otherwise can't be done, as read's generic parameters are unknown.
        const graphT = graphN.compute<{[k in ExpressionRef["type"]]: {expressionType: TypeRef}} & {ExpressionCall: {genericTypes: TypeRef[]}}>({
            ExpressionInteger: {
                expressionType: () => {
                    return builtinTypeNames.Int;
                }
            },
            ExpressionString: {
                expressionType: () => {
                    return builtinTypeNames.String;
                }
            },
            ExpressionVariable: {
                expressionType: (self, result): TypeRef => {
                    const declare = self.variableDeclaration;
                    if (self.variableDeclaration.type == "DeclareVar") {
                        return graphN.get(self.variableDeclaration).type;
                    } else if (self.variableDeclaration.type == "DeclareFunction") {
                        const func = result.get(self.variableDeclaration);
                        return result.insert("TypeFunction", {
                            type: "function",
                            effects: func.effects,
                            generics: func.generics,
                            arguments: func.arguments.map(a => result.get(a).type),
                            returns: func.returns,
                        });
                    } else {
                        const impossible: never = self.variableDeclaration;
                        return impossible;
                    }
                },
            },
            ExpressionDot: {
                expressionType: (self: {object: ExpressionRef, field: Token}, result) => {
                    const objectTypeRef = result.get(self.object).expressionType;
                    const objectType = result.get(objectTypeRef);
                    if (objectType.type != "name") {
                        // TODO: better error message
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-named type`;
                    }
                    const objectTypeDeclaration = objectType.typeDeclaration;
                    if (objectTypeDeclaration.type != "DeclareStruct") {
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-struct type`;
                    }
                    const structDeclaration = result.get(objectTypeDeclaration);
                    const variables = new Map<Ref<"DeclareGeneric">, TypeRef>();
                    for (let i = 0; i < structDeclaration.generics.length; i++) {
                        variables.set(structDeclaration.generics[i], objectType.parameters[i]);
                    }
                    for (let structField of structDeclaration.fields) {
                        if (structField.name.text == self.field.text) {
                            // Find the type of the field.
                            return typeSubstitute(structField.type, result, variables);
                        }
                    }
                    throw `cannot access field '${self.field.text}' at ${self.field.location} on object with struct type '${structDeclaration.name.text}' declared at ${structDeclaration.name.location}`;
                }
            },
            ExpressionCall: {
                genericTypes: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    if (funcType.type != "TypeFunction") {
                        throw `cannot call non-function '${prettyExpression(self.func, result)}'`; // TODO: location
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != self.arguments.length) {
                        throw `cannot call function '${prettyExpression(self.func, result)}' with wrong number of arguments`; // TODO: location
                    }
                    if (functionType.effects.length != 0) {
                        if (!self.hasEffect) {
                            throw `cannot perform call '${prettyExpression(selfRef, result)}' without bang to invoke effects`;
                        }
                    }
                    if (functionType.effects.length == 0) {
                        if (self.hasEffect) {
                            throw `cannot perform call '${prettyExpression(selfRef, result)}' with bang since function has no effects`;
                        }
                    }
                    const unified = new Map<Ref<"DeclareGeneric">, TypeRef[]>();
                    for (let generic of functionType.generics) {
                        unified.set(generic, []);
                    }
                    for (let i = 0; i < functionType.arguments.length; i++) {
                        let message = matchType(unified, result, functionType.arguments[i], result.get(self.arguments[i]).expressionType, new Map());
                        if (message !== true) {
                            throw `cannot match type of argument ${i+1} in ${prettyExpression(selfRef, graph)} with expected type ${prettyType(functionType.arguments[i], result)}: ${message}`;
                        }
                    }
                    if (functionType.returns && expectedType.has(selfRef)) {
                        let message = matchType(unified, result, functionType.returns, expectedType.get(selfRef)!, new Map());
                        if (message !== true) {
                            throw `cannot match return type of ${prettyExpression(selfRef, graph)} with expected type ${prettyType(expectedType.get(selfRef)!, result)}; actual return type is ${prettyType(functionType.returns, result)}`;
                        }
                    }
                    // We require that
                    // (1) all parameters are now known
                    // (2) all constraints are satisfied. TODO
                    // (3) all assignments are equal
                    const answer: TypeRef[] = [];
                    for (let i = 0; i < functionType.generics.length; i++) {
                        let generic = functionType.generics[i];
                        let assign = unified.get(generic)!;
                        if (assign.length == 0) {
                            throw `generic parameter '${result.get(generic).name.text}' cannot be inferred from arguments or calling context`;
                        }
                        for (let i = 1; i < assign.length; i++) {
                            if (!typeIdentical(assign[0], assign[1], result)) {
                                throw `generic parameter '${result.get(generic).name.text}' is inconsistently assigned to both ${prettyType(assign[0], result)} and ${prettyType(assign[i], result)}`;
                            }
                        }
                        answer.push(assign[0]);
                    }
                    return answer;
                },
                expressionType: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    if (funcType.type != "TypeFunction") {
                        throw `cannot call non-function '${prettyExpression(self.func, result)}'`; // TODO: location
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != self.arguments.length) {
                        throw `cannot call function '${prettyExpression(self.func, result)}' with wrong number of arguments; got ${self.arguments.length} but ${functionType.arguments.length} expected`; // TODO: location
                    }
                    let genericAssign = self.genericTypes;
                    if (!functionType.returns) {
                        return builtinTypeNames.Unit;
                    }
                    const variables = new Map<Ref<"DeclareGeneric">, TypeRef>();
                    for (let i = 0; i < functionType.generics.length; i++) {
                        variables.set(functionType.generics[i], genericAssign[i]);
                    }
                    return typeSubstitute(functionType.returns, result, variables);
                },
            },
            ExpressionArray: {
                expressionType: (self, result, selfRef): TypeRef => {
                    if (self.fields.length == 0) {
                        if (expectedType.has(selfRef)) {
                            // use this to infer.
                            const expected = result.get(expectedType.get(selfRef)!);
                            if (expected.type != "name") {
                                throw `expected type '${prettyType(expectedType.get(selfRef)!, result)}' but got an empty array`; // TODO: location
                            }
                            if (expected.typeDeclaration != builtins.Array) {
                                throw `expected type '${prettyType(expectedType.get(selfRef)!, result)}' but got an empty array`; // TODO: location
                            }
                            return expectedType.get(selfRef)!;
                        }
                        throw `ambiguous empty literal array`;
                    }
                    for (let i = 1; i < self.fields.length; i++) {
                        if (!typeIdentical(result.get(self.fields[0]).expressionType, result.get(self.fields[i]).expressionType, result)) {
                            throw `array literal '${prettyExpression(selfRef, result)}' contains values with different types`;
                        }
                    }
                    return result.insert("TypeName", {
                        type: "name",
                        name: {type: "special", text: "Array", location: "<builtin>"},
                        parameters: [result.get(self.fields[0]).expressionType],
                        scope: null as any, // TODO: is this a problem?
                        typeDeclaration: builtins.Array,
                    });
                }
            },
            ExpressionObject: {
                expressionType: (self, result, selfRef) => {
                    let name = self.name;
                    const declaration = lookupScope(result, self.scope, name.text);
                    if (!declaration) {
                        throw `type '${name.text}' at ${name.location} is not in scope in ${prettyExpression(selfRef, result)}`;
                    }
                    if (declaration.type != "DeclareStruct") {
                        throw `name '${name.text}' at ${name.location} does not name a struct type in ${prettyExpression(selfRef, result)}`;
                    }
                    const struct = result.get(declaration);
                    let expectedTypeByName: {[name: string]: TypeRef} = {};
                    let actualTypeByName: {[name: string]: TypeRef} = {};
                    let setFieldByName : {[name: string]: boolean} = {};
                    for (let field of struct.fields) {
                        expectedTypeByName[field.name.text] = field.type;
                    }
                    for (let field of self.fields) {
                        if (!(field.name.text in expectedTypeByName)) {
                            throw `struct '${name.text}' has no field '${field.name.text}' at ${field.name.location}`;
                        }
                        if (setFieldByName[field.name.text]) {
                            throw `struct '${name.text}' already specified field '${field.name.text}' at ${field.name.location}`;
                        }
                        actualTypeByName[field.name.text] = result.get(field.value).expressionType;
                        setFieldByName[field.name.text] = true;
                    }
                    let unified = new Map<Ref<"DeclareGeneric">, TypeRef[]>();
                    for (let generic of struct.generics) {
                        unified.set(generic, []);
                    }
                    for (let fieldName in expectedTypeByName) {
                        if (!actualTypeByName[fieldName]) {
                            throw `struct literal for '${name.text} at ${name.location} is missing field '${fieldName}'`;
                        }
                        const message = matchType(unified, result, expectedTypeByName[fieldName], actualTypeByName[fieldName], new Map());
                        if (message !== true) {
                            throw `struct literal assignment for field '${fieldName}' at TODO has wrong type; expected ${prettyType(expectedTypeByName[fieldName], result)} but got ${prettyType(actualTypeByName[fieldName], result)}`;
                        }
                    }
                    // now, verify that the generics were used successfully.
                    // TODO: phantom types (via 'expected')
                    for (let generic of struct.generics) {
                        const assignments = unified.get(generic)!;
                        if (assignments.length == 0) {
                            throw `unable to determine generic parameter '${result.get(generic).name.text}' for struct literal of '${name.text}' at ${name.location}`;
                        }
                        for (let i = 1; i < assignments.length; i++) {
                            if (!typeIdentical(assignments[0], assignments[i], result)) {
                                throw `generic variable '${result.get(generic).name.text}' cannot be both '${prettyType(assignments[0], result)}' and '${prettyType(assignments[i], result)}' for '${name.text}' struct literal at ${name.location}`;
                            }
                        }
                    }
                    return result.insert("TypeName", {
                        type: "name",
                        name: struct.name,
                        parameters: struct.generics.map(g => unified.get(g)![0]),
                        scope: self.scope,
                        typeDeclaration: declaration,
                    });
                }
            },
            ExpressionOperator: {
                expressionType: () => {
                    return null as any; // TODO
                }
            }

            /*
type DotExpression = {expression: "dot", object: Expression, field: Token};
type CallExpression = {expression: "call", function: Expression, arguments: Expression[]};
type EffectExpression = {expression: "bang", function: Expression, arguments: Expression[]};
type ServiceExpression = {expression: "service", service: Token, arguments: Expression[], body: Expression}; // discharges or reinterprets effects
type ObjectExpression = {expression: "object", name: Token, fields: {name: Token, value: Expression}[]};
type ArrayExpression = {expression: "array", name: Token | null, items: Expression[]};
// TODO: map expression
type OperatorExpression = {expression: "operator", operator: Token, left: Expression, right: Expression};
type PrefixExpression = {expression: "prefix", operator: Token, right: Expression};
// TODO: impure function expressions + briefer lambdas + void
type FunctionExpression = {expression: "function", generics: Generic[], arguments: {name: Token, type: Type}[], returns: Type, body: Block}

type Expression = IntegerExpression | StringExpression | VariableExpression | DotExpression | CallExpression | EffectExpression | ServiceExpression | ObjectExpression | ArrayExpression | OperatorExpression | PrefixExpression | FunctionExpression;
*/
        });
        // we now perform type-checking.
        // for some thing, this should be very easy.
        // for others, it is hard.

        console.log(graph);
    } catch (e) {
        console.log("error:" , e);
    }
}
