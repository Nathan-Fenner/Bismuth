
type ObjHas<Obj, K extends string> = ({[K in keyof Obj]: '1' } & { [k: string]: '0' })[K];
type IfObjHas<Obj, K extends string, Yes, No = never> = ({[K in keyof Obj]: Yes } & { [k: string]: No })[K];
type Overwrite<K, T> = {[P in keyof T | keyof K]: { 1: T[P], 0: K[P] }[ObjHas<T, P>]};


type InsertNode<Shape, Variety extends keyof Shape> = {
    [prop in keyof Shape[Variety]]: Shape[Variety][prop] | {
        $new: keyof Shape,
        is: (self: Ref<Variety>, make: <Variety2 extends keyof Shape>(insertVariety:Variety2, properties: InsertNode<Shape, Variety2>) => Ref<Variety2>) => Shape[Variety][prop],
    }
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
    public readonly instantiator: {$new: (parent: Ref<Type>) => Type};
    constructor(
        public readonly type: Type,
        public readonly identifier: string
    ) {
        // nothing
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
    insert<Variety extends keyof Shape>(insertVariety: Variety, properties: InsertNode<Shape, Variety>): GraphOf<Shape> {
        const newNodes: any = {};
        for (let variety in this.nodes) {
            newNodes[variety] = {};
            for (let id in this.nodes[variety]) {
                newNodes[variety][id] = Object.assign({}, this.nodes[variety][id]);
            }
        }
        const insertModify = <Variety extends keyof Shape>(insertVariety:Variety, properties: InsertNode<Shape, Variety>): Ref<Variety> => {
            let newId = unique();
            newNodes[insertVariety][newId] = {};
            for (let property in properties) {
                let assignment = properties[property];
                if (typeof assignment == "object" && assignment !== null && "$new" in assignment) {
                    newNodes[insertVariety][newId][property] = (assignment as any).is(new Ref(insertVariety, newId), insertModify);
                } else {
                    newNodes[insertVariety][newId][property] = assignment;
                }
            }
            return new Ref(insertVariety, newId);
        }
        insertModify(insertVariety, properties);

        return new GraphOf(newNodes);
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
                    });
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
        operator: /^[+-*/=<>?%^~]+/,
    };
    let special = ["func", "self", "never", "struct", "enum", "switch", "case", "yield", "is", "and", "or", "if", "while", "var", "for", "else", "service", "effect", "return", "break", "continue"];
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
    return result.filter(token => ["comment", "whitespace"].indexOf(token.type) >= 0);
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
type Statement = VariableStatement | AssignStatement | IfStatement | WhileStatement | ReturnStatement | BreakStatement | ContinueStatement | YieldStatement | SwitchStatement;

type Block = Statement[];

//
// Expressions
//

type IntegerExpression = {expression: "integer", token: Token};
type StringExpression = {expression: "string", token: Token};
type VariableExpression = {expression: "variable", variable: Token};
type DotExpression = {expression: "dot", object: Expression, field: Token};
type CallExpression = {expression: "call", function: Expression, arguments: Expression[]};
type EffectExpression = {expression: "bang", function: Expression, arguments: Expression[]};
type ServiceExpression = {expression: "service", service: Token, arguments: Expression[], body: Expression}; // discharges or reinterprets effects
type ObjectExpression = {expression: "object", name: Token, fields: {name: Token, value: Expression}[]};
type ArrayExpression = {expression: "array", name: Token | null, items: Expression[]};
// TODO: map expression
type OperatorExpression = {expression: "operator", operator: Token, left: Expression, right: Expression};
type PrefixExpression = {expression: "prefix", operator: string, right: Expression};
// TODO: impure function expressions + briefer lambdas + void
type FunctionExpression = {expression: "function", generics: Generic[], arguments: {name: Token, type: Type}[], returns: Type, body: Block}

type Expression = IntegerExpression | StringExpression | VariableExpression | DotExpression | CallExpression | EffectExpression | ServiceExpression | ObjectExpression | ArrayExpression | OperatorExpression | PrefixExpression | FunctionExpression;


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
            return {
                result: Object.assign({}, first.result, second.result),
                rest: second.rest,
            };
        });
    }
    thenIn<P>(otherMap: {[k in keyof P]: Maker<T, ParserFor<P[k]>>}): ParserFor<T & P> {
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
                if (selectsToken(finish, stream.head())) {
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
                    if (stream.head().type == "special" && stream.head().text == k) {
                        if (typeof p === "function") {
                            return p(stream.head()).run(stream.tail());
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
    "[": (open: Token) => {
        parseGeneric.manyBetween(",").thenWhen(
            {
                "]": pure({}),
            },
            ParserFor.fail(`expected ']' to close '[' opened at ${showToken(open)}`)
        );
    }
}, pure([]));

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
    "=>": parseType.map(returns => ({returns}))
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
            "{": (open: Token) => parseStructFields.map(fields => ({fields})).thenWhen({
                "}": pure({}),
            }, ParserFor.fail(`expected '}' to match '{' opened at ${showToken(name)}`))
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
            "{": (open: Token) => parseEnumVariants.map(variants => ({variants})).thenWhen({
                "}": pure({}),
            }, ParserFor.fail(`expected '}' to match '{' opened at ${showToken(name)}`))
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

let parseExpressionSuffixes: ParserFor<ExpressionSuffix[]> = null as any;

let parseExpressionChained: ParserFor<Expression> = parseExpressionAtom.map(expression => ({base: expression})).thenIn({suffixes: parseExpressionSuffixes}).map((chain: {base: Expression, suffixes: ExpressionSuffix[]}) => {
    let base = chain.base;
    for (let suffix of chain.suffixes) {
        switch (suffix.suffix) {
        case "call":
            base = {
                expression: "call",
                function: base,
                arguments: suffix.arguments,
            };
            break;
        case "bang":
            base = {
                expression: "bang",
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
    pure({}).thenIn({lhs: parseExpression}).thenWhen({
        "=": pure<{statement: "assign"}>({statement: "assign"})
            .thenIn({rhs: parseExpression})
            .thenToken({"_": ";"}, `expected ';' to follow assignment`),
        ";": ({lhs}: {lhs: Expression}) => ({statement: "expression", expression: lhs}),
    }, ParserFor.fail(`expected ';' or '=' to follow statement-expression`))
);

parseStatement.run = (stream) => parseStatementInternal.run(stream);

let parseModule: ParserFor<Declare[]> = parseDeclare.manyUntil("$end");
