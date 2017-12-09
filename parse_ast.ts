
import {
    Token,
    showToken,
} from './lex';

import {
    ParserFor,
    pure,
    matched,
} from './parsing';

import {
    DeclareStruct,
    DeclareEnum,
    DeclareFunction,
    DeclareInterface,
    DeclareInstance,
    DeclareEffect,
    DeclareService,
    Declare,

    Generic,
    NamedType,
    FunctionType,
    NeverType,
    SelfType,
    Type,

    VariableStatement,
    AssignStatement,
    IfStatement,
    WhileStatement,
    ExpressionStatement,
    ReturnStatement,
    BreakStatement,
    ContinueStatement,
    YieldStatement,
    SwitchStatement,
    Statement,
    Block,

    IntegerExpression,
    StringExpression,
    VariableExpression,
    DotExpression,
    CallExpression,
    ServiceExpression,
    ObjectExpression,
    ArrayExpression,
    OperatorExpression,
    PrefixExpression,
    FunctionExpression,
    Expression,
} from './initial_ast';

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

let parseFunctionType: (funcToken: Token) => ParserFor<FunctionType> = (funcToken) => parseGenerics.map(generics => ({generics}))
    .then(parseEffects)
    .then(parseArgumentTypes)
    .then(parseReturnType)
    .merge<{type: "function", funcToken: Token}>({type: "function", funcToken})
;

let parsePureFunctionType: (funcToken: Token) => ParserFor<FunctionType> = (funcToken) => parseGenerics.map(generics => ({generics}))
    .then(pure({effects: []}))
    .then(parseArgumentTypes)
    .then(parseReturnType)
    .merge<{type: "function", funcToken: Token}>({type: "function", funcToken})
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
    "func": (funcToken: Token) => ParserFor.when({
        $name: (name: Token) => parseFunctionType(funcToken)
            .map(type => ({name, type}))
            .thenWhen({
                ";": pure({}),
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

let parseDeclareInstance: ParserFor<DeclareInstance> = ParserFor.when({
    $name: (name: Token) => pure({interface: name}),
}, ParserFor.fail(`expected interface name to follow 'instance`)).thenIn({
    generics: parseGenerics,
}).thenWhen({
    "for": pure({}),
}, ParserFor.fail(`expected 'for' to follow instance name`)).thenIn({
    type: ParserFor.when({$name: (name: Token) => parseNamedType(name)}, ParserFor.fail(`expected type name to follow 'for' in instance declarationparseNamedType`)),
}).thenWhen({
    "{": (open: Token) => ParserFor.when({
        "func": parseDeclareFunction,
    }, ParserFor.fail(`expected 'func' to declare instance member`)).manyUntil("}").map(fields =>
        ({methods: fields})
    ).thenWhen({
        "}" : pure({}),
    }, ParserFor.fail(`expected '}' to close '{' opened at ${open.location}`)),
}, ParserFor.fail(`expected '{' to follow type name in instance`))
.merge({declare: "instance" as "instance"});

let parseEffectAction: ParserFor<{name: Token, type: FunctionType}> = ParserFor.when({
    "func": (funcToken: Token) => ParserFor.when({
        $name: (name: Token) => ParserFor.when({
            "!": pure({})
        }, ParserFor.fail(`expected '!' to follow action name`)).then( parsePureFunctionType(funcToken)
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

function commaSeparated<T>(open: Token, p: ParserFor<T>): ParserFor<T[]> {
    return ParserFor.when({")": pure([])}, p.map(x => ({first: x})).thenIn({rest: p.manyWhen([","])}).map(bunch => {
        return [bunch.first].concat(bunch.rest.map(x => x.item));
    }).thenWhen({
        ")": pure({}),
    }, ParserFor.fail(`expected ')' to close '(' opened at ${showToken(open)}`)));
}

let parseArguments: ParserFor<{name: Token, type: Type}[]> = ParserFor.when({
    "(": (open: Token) => commaSeparated(open, parseArgument),
}, pure([]));

let parseBlock: ParserFor<Block> = new ParserFor(null as any);

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
    "instance": parseDeclareInstance,
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
    $name: (variable: Token) => pure<VariableExpression>({expression: "variable", at: variable, variable}),
    $integer: (integer: Token) => pure<IntegerExpression>({expression: "integer", at: integer, token: integer}),
    $string: (string: Token) => pure<StringExpression>({expression: "string", at: string, token: string}),
    "(": (open: Token) => parseExpression.thenWhen({
        ")": pure({}),
    }, ParserFor.fail(`expected ")" to close "(" opened at ${showToken(open)}`)),
    "#": (hash: Token) => ParserFor.when({
        $name: (name: Token): ParserFor<ObjectExpression> => ParserFor.when({
            "{": (open: Token) => ParserFor.when(
                {
                    "}": pure<ObjectExpression>({expression: "object", at: name, name, contents: {type: "fields" as "fields", fields: []}})
                },
                parseObjectField.manyBetween(",").thenWhen({
                    "}": pure({}),
                }, ParserFor.fail(`expected '}' to close ${showToken(open)}`)).map((fields): ObjectExpression => {
                    return {expression: "object", at: name, name, contents: {type: "fields", fields}};
                })
            ),
            "(": (open: Token) => parseExpression.map<ObjectExpression>(e => ({
                expression: "object",
                at: name,
                name: name,
                contents: {
                    type: "single",
                    value: e,
                },
            })).thenWhen({
                ")": pure({}),
            }, ParserFor.fail(`expected ')' to close '(' opened at ${open.location}`)),
        }, pure<ObjectExpression>({expression: "object", at: name, name: name, contents: {type: "empty"}})),
        "[": (open: Token) => ParserFor.when(
            {
                "]": pure<ArrayExpression>({expression: "array", at: hash, name: null, items: []}),
            },
            parseExpression.manyBetween(",").thenWhen({
                "]": pure({}),
            }, ParserFor.fail(`expected ']' to close array`)).map((items): ArrayExpression => {
                return {expression: "array", at: hash, name: null, items};
            }),
        ),
    }, ParserFor.fail(`expected constructor name or array literal to follow '#'`)),
    // TODO: 'use' for service
    // TODO: function expressions
}, ParserFor.fail(`expected expression`));

type ExpressionSuffix = {suffix: "call", arguments: Expression[]} | {suffix: "bang", arguments: Expression[]} | {suffix: "cast", into: Type} | {suffix: "field", field: Token}

function parses<T>(x: ParserFor<T>): ParserFor<T> {
    return x;
}

// A suffix binds tightly to its atomic expression.
let parseExpressionSuffix: ParserFor<ExpressionSuffix | null> = ParserFor.when({
    "(": (open: Token) => commaSeparated(open, parseExpression).map(item => {
        return ({suffix: "call" as "call", arguments: item});
    }),
    "!": parses<ExpressionSuffix>(ParserFor.when({
        "(": (open: Token) => commaSeparated(open, parseExpression).map(item => {
            return {suffix: "bang" as "bang", arguments: item};
        }),
    }, ParserFor.fail(`expected '(' to begin function call after '!'`))),
    ".": (dot: Token) => ParserFor.when({
        $name: (field: Token) => pure<{suffix:"field", field: Token}>({suffix: "field", field}),
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
                at: base.at,
                hasEffect: false,
                function: base,
                arguments: suffix.arguments,
            };
            break;
        case "bang":
            base = {
                at: base.at,
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
                at: base.at,
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
                    at: combined.at,
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
                    at: branch.suffixes[i].item.at,
                    operator: branch.suffixes[i+1].lead,
                    left: branch.suffixes[i].item,
                    right: combined,
                };
            }
            combined = {
                expression: "operator",
                at: branch.base.at,
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

let parseBlockInternal: ParserFor<Block> = ParserFor.when({
    "{": (open: Token) => parseStatement.manyUntil("}").map(body => ({body})).thenWhen({
        "}": pure({at: open}),
    }, ParserFor.fail(`expected "}" to close block opened at ${showToken(open)}`))
}, ParserFor.fail(`expected "{" to open block`));
parseBlock.run = (stream) => parseBlockInternal.run(stream);

let parseMatchBranches: ParserFor<{pattern: {name: Token, variable: {name: Token, type: Type} | null}, block: Block}> = ParserFor.when({
    "$name": (variantName: Token) => ParserFor.when({
        "of": ParserFor.when({
            "var": ParserFor.when({
                "$name": (name: Token) => ParserFor.when({
                    ":": parseType.map(t => ({name: variantName, variable: {name: name, type: t}})),
                }, ParserFor.fail(`expected ':' after variable '${name.text}' at ${name.location} in case of match`))
            }, ParserFor.fail(`expected 'var' to follow 'of' in case of match statement`))
        }, ParserFor.fail(`expected 'var' to follow 'of' in switch statement`))
    }, pure({name: variantName, variable: null}))
}, ParserFor.fail(`expected name to follow 'case' in switch statement`)).map(pattern => ({pattern}))
.thenIn({
    block: parseBlock
})

let parseStatementInternal: ParserFor<Statement> = ParserFor.when({
    "if": (ifToken: Token) => pure<{statement: "if", at: Token}>({statement: "if", at: ifToken})
        .thenIn({condition: parseExpression})
        .thenIn({thenBlock: parseBlock})
        .thenWhen({
                "else": pure({}).thenIn({elseBlock: parseBlock}),
            },
            pure({elseBlock: null})
        ),
    "while": (whileToken: Token) => pure<{statement: "while", at: Token}>({statement: "while", at: whileToken})
        .thenIn({condition: parseExpression})
        .thenIn({bodyBlock: parseBlock}),
    "match": (matchToken: Token): ParserFor<SwitchStatement> => pure<{statement: "switch", at: Token}>({statement: "switch", at: matchToken})
        .thenIn({expression: parseExpression})
        .thenIn({branches: parseMatchBranches.manyWhen(["case"]).map(arr => arr.map(x => x.item))}),
    "var": (varToken: Token) => pure<{statement: "var", at: Token}>({statement: "var", at: varToken})
        .thenToken({name: "$name"}, `expected variable name`)
        .thenToken({"_": ":"}, `expected ':' to follow variable name`)
        .thenIn({type: parseType})
        .thenToken({"_": "="}, `expected '=' to follow variable declaration (TODO: future Bismuth versions will lift this restriction)`)
        .thenIn({expression: parseExpression})
        .thenToken({"_": ";"}, `expected ';' to end variable declarations`),
    "break": (breakToken: Token) => pure<{statement: "break", at: Token}>({statement: "break", at: breakToken})
        .thenToken({"_": ";"}, `expected ';' to follow break`),
    "continue": (continueToken: Token) => pure<{statement: "continue", at: Token}>({statement: "continue", at: continueToken})
        .thenToken({"_": ";"}, `expected ';' to follow continue`),
    "return": (returnToken: Token) => pure<{statement: "return", at: Token}>({statement: "return", at: returnToken})
        .thenWhen({
            ";": pure({expression: null}),
        }, pure({}).thenIn({expression: parseExpression}).thenToken({"_": ";"}, `expected ';' to follow return expression`)),
},
    pure({}).thenIn({expression: parseExpression}).thenInstead(({expression}) => {
        return ParserFor.when({
            ";": pure<{statement: "expression", at: Token, expression: Expression}>({statement: "expression", at: expression.at, expression}),
            "=": parseExpression.map(rhs => {
                const assignStatement: AssignStatement = {statement: "assign", at: expression.at, lhs: expression, rhs};
                return assignStatement;
            }).thenWhen({
                ";": pure({}),
            }, ParserFor.fail(`expected ';' to terminate expression in assignment`)),
        }, ParserFor.fail(`expected ';' or '=' to terminate expression-as-statement`));
    })
);

parseStatement.run = (stream) => parseStatementInternal.run(stream);

let parseModule: ParserFor<Declare[]> = parseDeclare.manyUntil("$end");

export {
    parseModule
};
