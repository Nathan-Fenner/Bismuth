
// TODO:
// interface methods cannot be generic
// no way to construct / deconstruct enum values
// no way to declare effects
// non-trivial effects are not implemented (no code gen)
// polymorphism is slow and always boxed

import {Diff, Omit, unique} from './utility'

import {Ref, GraphOf, link} from './graph'

import {Token, TokenStream, ParseError, lex, showToken, TokenSelector, selectsToken} from './lex'

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
    DiscardStatement,
    Statement,
    Block,

    IntegerExpression,
    StringExpression,
    BooleanExpression,
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

import {
    ParserFor,
    pure,
    matched,
} from './parsing';

import { parseModule } from './parse_ast';

// import C from './intermediate';

type ExpressionRef
    = Ref<"ExpressionInteger">
    | Ref<"ExpressionString">
    | Ref<"ExpressionBoolean">
    | Ref<"ExpressionVariable">
    | Ref<"ExpressionDot">
    | Ref<"ExpressionCall">
    | Ref<"ExpressionObject">
    | Ref<"ExpressionArray">
    | Ref<"ExpressionOperator">
    | Ref<"ExpressionBorrow">
    | Ref<"ExpressionForeign">

type TypeRef
    = Ref<"TypeName">
    | Ref<"TypeFunction">
    | Ref<"TypeSelf">
    | Ref<"TypeBorrow">
    

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
    // | Ref<"StatementBlock">
    | Ref<"StatementIf">
    | Ref<"StatementWhile">
    | Ref<"StatementMatch">
    | Ref<"StatementDiscard">

type DeclareRef
    = Ref<"DeclareBuiltinType">
    | Ref<"DeclareBuiltinVar">
    | Ref<"DeclareStruct">
    | Ref<"DeclareEnum">
    | Ref<"DeclareVariant">
    | Ref<"DeclareGeneric">
    | Ref<"DeclareFunction">
    | Ref<"DeclareVar">
    | Ref<"DeclareMethod">
    | Ref<"DeclareInterface">

// the ProgramGraph is a graph representation of the AST.
type ProgramGraph = { // an expression node is just like an expression, except it has Ref<"Expression"> instead of Expression as a child
    // TODO: service, function
    ExpressionInteger:  {type: "integer",  at: Token, scope: Ref<"Scope">, value: Token},
    ExpressionString:   {type: "string",   at: Token, scope: Ref<"Scope">, value: Token},
    ExpressionBoolean:  {type: "boolean",  at: Token, scope: Ref<"Scope">, value: Token},
    ExpressionVariable: {type: "variable", at: Token, scope: Ref<"Scope">, variable: Token},
    ExpressionDot:      {type: "dot",      at: Token, scope: Ref<"Scope">, object: ExpressionRef, field: Token},
    ExpressionCall:     {type: "call",     at: Token, scope: Ref<"Scope">, hasEffect: boolean, func: ExpressionRef, arguments: ExpressionRef[]},
    ExpressionOperator: {type: "operator", at: Token, scope: Ref<"Scope">, operator: Token, func: ExpressionRef, left: ExpressionRef | null, right: ExpressionRef},
    ExpressionObject:   {
        type: "object",
        at: Token,
        scope: Ref<"Scope">,
        name: Token,
        contents: {type: "fields", fields: {name: Token, value: ExpressionRef}[]} | {type: "empty"} | {type: "single", value: ExpressionRef},
    },
    ExpressionArray:    {type: "array",   at: Token, scope: Ref<"Scope">, fields: ExpressionRef[]},
    ExpressionBorrow:   {type: "borrow",  at: Token, scope: Ref<"Scope">, mutable: boolean, reference: ReferenceRef},
    ExpressionForeign:  {type: "foreign", at: Token, scope: Ref<"Scope">},
    // TODO: map/array access
    ReferenceVar: {type: "variable", at: Token, scope: Ref<"Scope">, name: Token},
    ReferenceDot: {type: "dot",      at: Token, scope: Ref<"Scope">, object: ReferenceRef, field: Token},
    // TODO: for
    StatementDo:       {is: "do",       at: Token, scope: Ref<"Scope">, expression: ExpressionRef},
    StatementVar:      {is: "var",      at: Token, scope: Ref<"Scope">, declare: Ref<"DeclareVar">, expression: ExpressionRef},
    StatementAssign:   {is: "assign",   at: Token, scope: Ref<"Scope">, reference: ReferenceRef, expression: ExpressionRef},
    StatementReturn:   {is: "return",   at: Token, scope: Ref<"Scope">, expression: null | ExpressionRef},
    StatementBreak:    {is: "break",    at: Token, scope: Ref<"Scope">},
    StatementContinue: {is: "continue", at: Token, scope: Ref<"Scope">},
    StatementIf:       {is: "if",       at: Token, scope: Ref<"Scope">, condition: ExpressionRef,  then: Ref<"StatementBlock">, otherwise: Ref<"StatementBlock">},
    StatementWhile:    {is: "while",    at: Token, scope: Ref<"Scope">, condition: ExpressionRef, body: Ref<"StatementBlock">},
    StatementMatch:    {is: "match",    at: Token, scope: Ref<"Scope">, expression: ExpressionRef, branches: {variant: Token, bind: Ref<"DeclareVar"> | null, block: Ref<"StatementBlock">}[]},
    StatementDiscard:  {is: "discard",  at: Token, scope: Ref<"Scope">, name: Token},
    StatementBlock:    {is: "block",    at: Token, scope: Ref<"Scope">, body: StatementRef[]},

    TypeName:     {type: "name", name: Token, parameters: TypeRef[], scope: Ref<"Scope">},
    TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[] , returns: TypeRef | null},
    TypeSelf:     {type: "self", self: Token},
    TypeBorrow:   {type: "borrow", mutable: boolean, reference: TypeRef},

    DeclareBuiltinType: {declare: "builtin-type", name: Token, linear: boolean, parameterCount: number}, // TODO: constraints on parameters?
    DeclareBuiltinVar:  {declare: "builtin-var",  name: Token, valueType: TypeRef},
    DeclareGeneric:     {declare: "generic",      name: Token, linear: boolean, constraintNames: Token[], scope: Ref<"Scope">},
    DeclareStruct:      {declare: "struct",       name: Token, generics: Ref<"DeclareGeneric">[], fields: {name: Token, type: TypeRef}[]},
    DeclareEnum:        {declare: "enum",         name: Token, generics: Ref<"DeclareGeneric">[], variants: {name: Token, type: TypeRef | null}[]},
    DeclareVariant:     {declare: "variant",      name: Token, owner: Ref<"DeclareEnum">},
    DeclareFunction:    {declare: "function",     name: Token, scale: {scale: "global"} | {scale: "local" | "instance", unique: string}, effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: Ref<"DeclareVar">[], returns: TypeRef | null, body: Ref<"StatementBlock">},
    DeclareMethod:      {declare: "method",       name: Token, interface: Ref<"DeclareInterface">, type: Ref<"TypeFunction">, valueType: Ref<"TypeFunction">},
    DeclareInterface:   {declare: "interface",    name: Token, methods: Ref<"DeclareMethod">[]},
    DeclareInstance:    {declare: "instance",     name: Token, type: Ref<"TypeName">, generics: Ref<"DeclareGeneric">[], methods: Ref<"DeclareFunction">[]},
    DeclareVar:         {declare: "var",          name: Token, type: TypeRef},

    SatisfyInstance: {declare: "instance", interface: Ref<"DeclareInterface">, source: Ref<"DeclareGeneric"> | Ref<"DeclareStruct">, generics: {constraints: Ref<"DeclareInterface">[]}[]}, // TODO: non-struct instances

    Scope: {
        parent: Ref<"Scope"> | null,
        returnsFrom?: Ref<"DeclareFunction">,
        allowsSelf?: true,
        breaksFrom?: StatementRef,
        inScope: {[name: string]: DeclareRef},
    }
};

function compile(source: string) {
    try {
        let lexed = lex(source);
        if (lexed instanceof ParseError) {
            (document.getElementById("generatedJS") as any).innerText = "";
            (document.getElementById("generatedC") as any).innerText = "";
            (document.getElementById("errors") as any).innerText = lexed.message;
            return;
        }
        let declarations = parseModule.run(new TokenStream(lexed));
        let graph = new GraphOf<ProgramGraph>({ // TODO: build this collection lazily, so that it doesn't need to be done right here.
            ExpressionInteger: {},
            ExpressionString: {},
            ExpressionBoolean: {},
            ExpressionVariable: {},
            ExpressionDot: {},
            ExpressionCall: {},
            ExpressionOperator: {},
            ExpressionObject: {},
            ExpressionArray: {},
            ExpressionBorrow: {},
            ExpressionForeign: {},
            ReferenceVar: {},
            ReferenceDot: {},
            StatementDo: {},
            StatementVar: {},
            StatementAssign: {},
            StatementReturn: {},
            StatementBreak: {},
            StatementContinue: {},
            StatementIf: {},
            StatementWhile: {},
            StatementMatch: {},
            StatementDiscard: {},
            StatementBlock: {},
            TypeName: {},
            TypeFunction: {},
            TypeSelf: {},
            TypeBorrow: {},
            DeclareBuiltinType: {},
            DeclareBuiltinVar: {},
            DeclareStruct: {},
            DeclareEnum: {},
            DeclareVariant: {},
            DeclareGeneric: {},
            DeclareFunction: {},
            DeclareMethod: {},
            DeclareInterface: {},
            DeclareInstance: {},
            SatisfyInstance: {},
            DeclareVar: {},
            Scope: {},
        });

        let uniqueCounter = 0;
        function uniqueName(): string {
            uniqueCounter++;
            return "tmp" + uniqueCounter;
        }

        function graphyType(t: Type, scope: Ref<"Scope">): TypeRef {
            if (t.type == "named") {
                return graph.insert("TypeName", {
                    type: "name",
                    name: t.name,
                    parameters: t.parameters.map(p => graphyType(p, scope)),
                    scope,
                });
            } else if (t.type == "self") {
                let okay = false;
                for (let s: Ref<"Scope"> | null = scope; s; s = scope.in(graph).parent) {
                    if (s.in(graph).allowsSelf) {
                        okay = true;
                        break;
                    }
                }
                if (!okay) {
                    throw `self type is not allowed in the context at ${t.self.location}`;
                }
                return graph.insert("TypeSelf", {
                    type: "self", 
                    self: t.self,
                });
            } else if (t.type == "function") {
                return graph.insert("TypeFunction", {
                    type: "function",
                    effects: t.effects,
                    generics: t.generics.map(generic => graph.insert("DeclareGeneric", {
                        declare: "generic",
                        name: generic.name,
                        linear: generic.linear,
                        constraintNames: generic.constraints,
                        scope: scope,
                    })),
                    arguments: t.arguments.map(a => graphyType(a, scope)),
                    returns: t.returns ? graphyType(t.returns, scope) : null,
                });
            } else if (t.type == "borrow") {
                return graph.insert("TypeBorrow", {
                    type: "borrow",
                    mutable: t.mutable,
                    reference: graphyType(t.reference, scope),
                })
            } else if (t.type == "never") {
                throw "TODO implement never types";
            } else {
                const impossible: never = t;
                return impossible;
            }
        }
        function graphyExpression(e: Expression, scope: Ref<"Scope">): ExpressionRef {
            if (e.expression == "string") {
                return graph.insert("ExpressionString", {
                    type: "string",
                    at: e.at,
                    scope,
                    value: e.token,
                });
            } else if (e.expression == "integer") {
                return graph.insert("ExpressionInteger", {
                    type: "integer",
                    at: e.at,
                    scope,
                    value: e.token,
                });
            } else if (e.expression == "boolean") {
                return graph.insert("ExpressionBoolean", {
                    type: "boolean",
                    at: e.at,
                    scope,
                    value: e.token,
                });
            } else if (e.expression == "variable") {
                return graph.insert("ExpressionVariable", {
                    type: "variable",
                    at: e.at,
                    scope,
                    variable: e.variable,
                });
            } else if (e.expression == "dot") {
                return graph.insert("ExpressionDot", {
                    type: "dot",
                    at: e.at,
                    scope,
                    object: graphyExpression(e.object, scope),
                    field: e.field,
                });
            } else if (e.expression == "call") {
                return graph.insert("ExpressionCall", {
                    type: "call",
                    at: e.at,
                    scope,
                    hasEffect: e.hasEffect,
                    func: graphyExpression(e.function, scope),
                    arguments: e.arguments.map(a => graphyExpression(a, scope)),
                });
            } else if (e.expression == "operator") {
                const binaryRenameMap: {[op: string]: string} = {
                    "+":  "add",
                    "-":  "subtract",
                    "*":  "multiply",
                    "/":  "divide",
                    "%":  "mod",
                    "^":  "pow",
                    "==": "equals",
                    "/=": "nequals",
                    ">":  "greater",
                    "<":  "less",
                    ">=": "greaterEqual",
                    "<=": "lessEqual",
                    "++": "append",
                };
                const prefixRenameMap: {[op: string]: string} = {
                    "-": "negate",
                };
                const renamed = e.left == null ? prefixRenameMap[e.operator.text] : binaryRenameMap[e.operator.text];
                if (!renamed) {
                    throw `ICE 1409: operator ${e.operator.text} does not have support as ${e.left == null ? "prefix" : "binary infix"} operator`;
                }
                return graph.insert("ExpressionOperator", {
                    type: "operator",
                    at: e.at,
                    scope,
                    operator: e.operator,
                    func: graphyExpression({expression: "variable", at: e.operator, variable: {type: "special", text: renamed, location: e.operator.location}}, scope),
                    left: graphyExpression(e.left, scope),
                    right: graphyExpression(e.right, scope),
                });
            } else if (e.expression == "prefix") {
                return graph.insert("ExpressionOperator", {
                    type: "operator",
                    at: e.at,
                    scope,
                    operator: e.operator,
                    func: graphyExpression({expression: "variable", at: e.operator, variable: e.operator}, scope),
                    left: null,
                    right: graphyExpression(e.right, scope),
                });
            } else if (e.expression == "object") {
                console.log(e);
                if (e.contents.type == "fields") {
                    return graph.insert("ExpressionObject", {
                        type: "object",
                        at: e.at,
                        scope,
                        name: e.name,
                        contents: {
                            type: "fields",
                            fields: e.contents.fields.map(({name, value}) => ({name, value: graphyExpression(value, scope)})),
                        },
                    });
                } else if (e.contents.type == "single") {
                    return graph.insert("ExpressionObject", {
                        type: "object",
                        at: e.at,
                        scope,
                        name: e.name,
                        contents: {
                            type: "single",
                            value: graphyExpression(e.contents.value, scope),
                        }
                    })
                } else if (e.contents.type == "empty") {
                    return graph.insert("ExpressionObject", {
                        type: "object",
                        at: e.at,
                        scope,
                        name: e.name,
                        contents: {
                            type: "empty",
                        }
                    })
                } else {
                    const impossible: never = e.contents;
                    return impossible;
                }
            } else if (e.expression == "array") {
                return graph.insert("ExpressionArray", {
                    type: "array",
                    at: e.at,
                    scope,
                    fields: e.items.map(item => graphyExpression(item, scope)),
                })
            } else if (e.expression == "borrow") {
                return graph.insert("ExpressionBorrow", {
                    type: "borrow",
                    at: e.at,
                    scope,
                    mutable: e.mutable,
                    reference: graphyReference(e.reference, scope),
                });
            } else if (e.expression == "function") {
                throw {message: "not implemented: function expressions", e};
            } else if (e.expression == "foreign") {
                return graph.insert("ExpressionForeign", {
                    type: "foreign",
                    at: e.at,
                    scope,
                });
            } else if (e.expression == "service") {
                throw {message: "not implemented: service expressions", e};
            } else {
                const impossible: never = e;
                return impossible;
            }
        }
        function graphyReference(r: Expression, scope: Ref<"Scope">): ReferenceRef {
            if (r.expression == "variable") {
                return graph.insert("ReferenceVar", {
                    type: "variable",
                    at: r.at,
                    scope,
                    name: r.variable,
                });
            } else if (r.expression == "dot") {
                return graph.insert("ReferenceDot", {
                    type: "dot",
                    at: r.at,
                    scope,
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
                let ref = graph.insert("StatementVar", {
                    is: "var",
                    at: s.at,
                    scope: parent,
                    declare: declare,
                    expression: graphyExpression(s.expression, parent),
                });
                let subscope = graph.insert("Scope", {
                    parent: parent,
                    inScope: { [s.name.text]: declare },
                });
                return {
                    ref,
                    nextScope: subscope,
                };
            } else if (s.statement == "assign") {
                return {
                    ref: graph.insert("StatementAssign", {
                        is: "assign",
                        at: s.at,
                        scope: parent,
                        reference: graphyReference(s.lhs, parent),
                        expression: graphyExpression(s.rhs, parent),
                    }),
                    nextScope: null,
                };
            } else if (s.statement == "return") {
                return {
                    ref: graph.insert("StatementReturn", {
                        is: "return",
                        at: s.at,
                        scope: parent,
                        expression: s.expression ? graphyExpression(s.expression, parent) : null,
                    }),
                    nextScope: null,
                };
            } else if (s.statement == "expression") {
                return {
                    ref: graph.insert("StatementDo", {
                        is: "do",
                        at: s.at,
                        scope: parent,
                        expression: graphyExpression(s.expression, parent),
                    }),
                    nextScope: null,
                }
            } else if (s.statement == "break") {
                return {
                    ref: graph.insert("StatementBreak", {is: "break", at: s.at, scope: parent}),
                    nextScope: null,
                };
            } else if (s.statement == "continue") {
                return {
                    ref: graph.insert("StatementContinue", {is: "continue", at: s.at, scope: parent}),
                    nextScope: null,
                };
            } else if (s.statement == "if") {
                return {
                    ref: graph.insert("StatementIf", {
                        is: "if",
                        at: s.at,
                        scope: parent,
                        condition: graphyExpression(s.condition, parent),
                        then: graphyBlock(s.thenBlock, parent),
                        otherwise: s.elseBlock ? graphyBlock(s.elseBlock, parent) : graphyBlock({at: s.at, body: []}, parent),
                    }),
                    nextScope: null,
                };
            } else if (s.statement == "while") {
                const whileStmt: Ref<"StatementWhile"> = graph.insert("StatementWhile", {
                    is: "while",
                    at: s.at,
                    scope: parent,
                    condition: graphyExpression(s.condition, parent),
                    body: link<"StatementWhile", Ref<"StatementBlock">>(stmt => graphyBlock(s.bodyBlock, graph.insert("Scope", {
                        parent,
                        inScope: {},
                        breaksFrom: stmt,
                    }))),
                });
                return {
                    ref: whileStmt,
                    nextScope: null,
                };
            } else if (s.statement == "switch") {
                const match: Ref<"StatementMatch"> = graph.insert("StatementMatch", {
                    is: "match",
                    at: s.at,
                    scope: parent,
                    expression: graphyExpression(s.expression, parent),
                    branches: s.branches.map(branch => {
                        let bind: Ref<"DeclareVar"> | null = null;
                        let branchScope = parent;
                        if (branch.pattern.variable) {
                            bind = graph.insert("DeclareVar", {
                                declare: "var",
                                name: branch.pattern.variable.name,
                                type: graphyType(branch.pattern.variable.type, parent),
                            });
                            branchScope = graph.insert("Scope", {
                                parent: parent,
                                inScope: {[branch.pattern.variable.name.text]: bind},
                            });
                        }
                        return {
                            variant: branch.pattern.name,
                            bind: bind,
                            block: graphyBlock(branch.block, branchScope),
                        };
                    }),
                });
                return {
                    ref: match,
                    nextScope: null,
                };
            } else if (s.statement == "yield") {
                throw `yield is not implemented;`
            } else if (s.statement == "discard") {
                return {
                    ref: graph.insert("StatementDiscard", {
                        is: "discard",
                        at: s.at,
                        name: s.name,
                        scope: parent,
                    }),
                    nextScope: null,
                };
            } else {
                const impossible: never = s;
                return impossible;
            }
        }
        function graphyBlock(block: Block, scope: Ref<"Scope">): Ref<"StatementBlock"> {
            let children: StatementRef[] = [];
            let currentScope = scope;
            for (let s of block.body) {
                let {ref, nextScope} = graphyStatement(s, currentScope);
                children.push(ref);
                if (nextScope) {
                    currentScope = nextScope;
                }
            }
            return graph.insert("StatementBlock", {
                is: "block",
                at: block.at,
                scope,
                body: children,
            });
        }

        const builtinToken = (x: string): {type: "special", text: string, location: "<builtin>"} => ({
            type: "special",
            text: x,
            location: "<builtin>",
        });

        const builtins = {
            "Int": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Int"), linear: false, parameterCount: 0}),
            "Unit": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Unit"), linear: false, parameterCount: 0}),
            "Bool": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Bool"), linear: false, parameterCount: 0}),
            "String": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("String"), linear: true, parameterCount: 0}),
            "Array": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Array"), linear: true, parameterCount: 1}),
        };
        const builtinTypeScope = graph.insert("Scope", {parent: null, inScope: builtins});

        const builtinTypeNames: {[k: string]: TypeRef} = {
            "Int": graph.insert("TypeName", {type: "name", name: builtinToken("Int"), parameters: [], scope: builtinTypeScope}),
            "Unit": graph.insert("TypeName", {type: "name", name: builtinToken("Unit"), parameters: [], scope: builtinTypeScope}),
            "Bool": graph.insert("TypeName", {type: "name", name: builtinToken("Bool"), parameters: [], scope: builtinTypeScope}),
            "String": graph.insert("TypeName", {type: "name", name: builtinToken("String"), parameters: [], scope: builtinTypeScope}),
        };

        const builtinVars: {[k: string]: DeclareRef} = {
            "print": graph.insert("DeclareBuiltinVar", {declare: "builtin-var", name: builtinToken("print"), valueType: graph.insert("TypeFunction", {type: "function", generics: [], arguments: [builtinTypeNames.String], returns: null, effects: [builtinToken("IO")]}) }),
        };
        const declareGenericT = graph.insert("DeclareGeneric", {
            declare: "generic",
            name: builtinToken("T"),
            linear: true,
            constraintNames: [],
            scope: builtinTypeScope,
        });
        const builtinGenericScope = graph.insert("Scope", {
            parent: null,
            inScope: {T: declareGenericT},
        });
        const generics = {
            T: graph.insert("TypeName", {type: "name", name: builtinToken("T"), parameters: [], scope: builtinGenericScope}),
        };
        
        builtinVars.at = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("at"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [declareGenericT],
                arguments: [
                    graph.insert("TypeBorrow", {
                        type: "borrow",
                        mutable: false,
                        reference: graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope})
                    }),
                    builtinTypeNames.Int,
                ],
                returns: generics.T,
                effects: []
            })
        });

        builtinVars.appendArray = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("appendArray"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [declareGenericT],
                arguments: [
                    graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}),
                    graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}),
                ],
                returns: graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}),
                effects: []
            }),
        });

        builtinVars.appendString = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("appendString"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [],
                arguments: [builtinTypeNames.String, builtinTypeNames.String],
                returns: builtinTypeNames.String,
                effects: []
            }),
        });

        builtinVars.length = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("length"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [declareGenericT],
                arguments: [
                    graph.insert("TypeBorrow", {
                        type: "borrow",
                        mutable: false,
                        reference: graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}),
                    }),
                ],
                returns: builtinTypeNames.Int,
                effects: []
            }),
        });

        builtinVars.show = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("show"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [],
                arguments: [builtinTypeNames.Int],
                returns: builtinTypeNames.String,
                effects: []
            })
        });

        builtinVars.less = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("less"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [],
                arguments: [builtinTypeNames.Int, builtinTypeNames.Int],
                returns: builtinTypeNames.Bool,
                effects: []
            })
        });

        builtinVars.add = graph.insert("DeclareBuiltinVar", {
            declare: "builtin-var",
            name: builtinToken("add"),
            valueType: graph.insert("TypeFunction", {
                type: "function",
                generics: [],
                arguments: [builtinTypeNames.Int, builtinTypeNames.Int],
                returns: builtinTypeNames.Int,
                effects: []
            })
        });

        const builtinScope = graph.insert("Scope", {
            parent: builtinTypeScope,
            inScope: builtinVars,
        });

        // in scope will be updated later
        let globalScope = graph.insert("Scope", {parent: builtinScope, inScope: {}});
        for (let declaration of declarations.result) {
            if (declaration.declare == "struct") {
                let struct = declaration;
                let generics = struct.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    linear: generic.linear,
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                let inScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (generic.in(graph).name.text in inScope) {
                        throw `generic variable '${generic.in(graph).name.text}' is redeclared at ${generic.in(graph).name.location}`;
                    }
                    inScope[generic.in(graph).name.text] = generic;
                }
                let scope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                let refTo: Ref<"DeclareStruct"> = graph.insert("DeclareStruct", {
                    declare:  "struct",
                    name:     declaration.name,
                    generics: generics,
                    fields:   struct.fields.map(field => ({name: field.name, type: graphyType(field.type, scope)})),
                });
                if (struct.name.text in globalScope.in(graph).inScope) {
                    throw `struct with name '${struct.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[struct.name.text]).name.location} but declared again at ${struct.name.location}`;
                }
                globalScope.in(graph).inScope[struct.name.text] = refTo;
            } else if (declaration.declare == "enum") {
                let alternates = declaration;
                let generics = alternates.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    linear: generic.linear,
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                let inScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (generic.in(graph).name.text in inScope) {
                        throw `generic variable '${generic.in(graph).name.text}' is redeclared at ${generic.in(graph).name.location}`;
                    }
                    inScope[generic.in(graph).name.text] = generic;
                }
                let scope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                let refTo: Ref<"DeclareEnum"> = graph.insert("DeclareEnum", {
                    declare:  "enum",
                    name:     declaration.name,
                    generics: generics,
                    variants:   alternates.variants.map(variant => ({name: variant.name, type: variant.type ? graphyType(variant.type, scope) : null})),
                });
                if (alternates.name.text in globalScope.in(graph).inScope) {
                    throw `enum with name '${alternates.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[alternates.name.text]).name.location} but declared again at ${alternates.name.location}`;
                }
                for (let alternate of declaration.variants) {
                    const variant = graph.insert("DeclareVariant", {
                        declare: "variant",
                        name: alternate.name,
                        owner: refTo,
                    });
                    if (alternate.name.text in globalScope.in(graph).inScope) {
                        throw `global with name '${alternate.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[alternate.name.text]).name.location} so the variant '${alternate.name.text}' at ${alternate.name.location} cannot be declared`;
                    }
                    globalScope.in(graph).inScope[alternate.name.text] = variant;
                }
                globalScope.in(graph).inScope[alternates.name.text] = refTo;
            } else if (declaration.declare == "function") {
                let func = declaration;
                let generics = func.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    linear: generic.linear,
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                let genericsInScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (generic.in(graph).name.text in genericsInScope) {
                        throw `generic '${generic.in(graph).name.text}' at ${generic.in(graph).name.location} was already declared`;
                    }
                    genericsInScope[generic.in(graph).name.text] = generic;
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
                    if (arg.in(graph).name.text in argsInScope) {
                        throw `argument '${arg.in(graph).name.text} at ${arg.in(graph).name.location} was already declared`;
                    }
                    argsInScope[arg.in(graph).name.text] = arg;
                }
                let argScope = graph.insert("Scope", {
                    parent: genericScope,
                    inScope: argsInScope,
                    returnsFrom: null as any, // QUESTION: this is evil
                });
                // TODO: effects
                let refTo = graph.insert("DeclareFunction",  {
                    declare: "function",
                    name: func.name,
                    scale: {scale: "global"},
                    effects: func.effects,
                    generics: generics,
                    arguments: args,
                    returns: func.returns ? graphyType(func.returns, argScope) : null,
                    body: graphyBlock(func.body, argScope),
                });
                argScope.in(graph).returnsFrom = refTo; // add backwards link
                if (func.name.text in globalScope.in(graph).inScope) {
                    throw `global with name '${func.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[func.name.text]).name.location} but declared again as function at ${func.name.location}`;
                }
                globalScope.in(graph).inScope[func.name.text] = refTo;
            } else if (declaration.declare == "interface") {
                const iface = declaration;
                let interfaceScope = graph.insert("Scope", {
                    allowsSelf: true,
                    parent: globalScope,
                    inScope: {},
                });
                // iface.methods[0].type.
                const refTo = graph.insert("DeclareInterface", {
                    declare: "interface",
                    name: iface.name,
                    methods: null as any, // QUESTION: set below
                });
                refTo.in(graph).methods = iface.methods.map(method => {
                    const regularType = graphyType(method.type, interfaceScope);
                    if (regularType.type != "TypeFunction") {
                        throw "ICE 1712";
                    }
                    const extraGeneric = graph.insert("DeclareGeneric", {
                        declare: "generic",
                        name: {text: "Self", location: method.name.location, type: "special"},
                        linear: true,
                        constraintNames: [iface.name],
                        scope: globalScope,
                    });
                    const original = graph.get(regularType);
                    
                    const replaceSelf = (t: TypeRef): TypeRef => {
                        if (t.type == "TypeName") {
                            return t;
                        } else if (t.type == "TypeSelf") {
                            // here we return the generic reference
                            return graph.insert("TypeName", {
                                type: "name",
                                name: {text: "Self", location: t.in(graph).self.location, type: "special"},
                                parameters: [],
                                scope: graph.insert("Scope", {
                                    inScope: {"Self": extraGeneric},
                                    parent: interfaceScope,
                                }),
                            });
                        } else if (t.type == "TypeFunction") {
                            const func = t.in(graph);
                            return graph.insert("TypeFunction", {
                                type: "function",
                                effects: func.effects,
                                generics: func.generics,
                                arguments: func.arguments.map(replaceSelf),
                                returns: func.returns ? replaceSelf(func.returns) : null,
                            });
                        } else if (t.type == "TypeBorrow") {
                            return graph.insert("TypeBorrow", {
                                type: "borrow",
                                mutable: t.in(graph).mutable,
                                reference: replaceSelf(t.in(graph).reference),
                            });
                        } else {
                            const impossible: never = t;
                            return impossible;
                        }
                    };
                    const valueType = graph.insert("TypeFunction", {
                        type: "function",
                        effects: original.effects,
                        generics: [extraGeneric].concat(original.generics),
                        arguments: original.arguments.map(replaceSelf),
                        returns: original.returns ? replaceSelf(original.returns) : null,
                    });
                    return graph.insert("DeclareMethod", {
                        declare: "method",
                        name: method.name,
                        type: regularType,
                        valueType: valueType,
                        interface: refTo, // QUESTION: safer? set below.
                    })
                });
                // add the interface to the global namespace.
                if (iface.name.text in globalScope.in(graph).inScope) {
                    throw `interface with name '${iface.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[iface.name.text]).name.location} but declared again at ${iface.name.location}`;
                }
                globalScope.in(graph).inScope[iface.name.text] = refTo;
                // adds each method to the global namespace
                for (let methodRef of refTo.in(graph).methods) {
                    const method = methodRef.in(graph);
                    if (method.name.text in globalScope.in(graph).inScope) {
                        throw `method with name '${method.name.text}' already declared at ${graph.get(globalScope.in(graph).inScope[method.name.text]).name.location} but declared again at ${method.name.location}`;
                    }
                    globalScope.in(graph).inScope[method.name.text] = methodRef;
                }
            } else if (declaration.declare == "instance") {
                // Insert the interface.
                const generics = declaration.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    linear: generic.linear,
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                const inScope: {[n: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    inScope[generic.in(graph).name.text] = generic;
                }
                const instanceScope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                const implementingType = graphyType(declaration.type, instanceScope);
                if (implementingType.type != "TypeName") {
                    throw `instance of class '${declaration.interface.text}' for type ${prettyType(implementingType, graph)} must be a named type, but is not.`;
                }
                graph.insert("DeclareInstance", {
                    declare: "instance",
                    generics: generics,
                    name: declaration.interface,
                    type: implementingType,
                    methods: declaration.methods.map(m => {
                        if (m.generics.length != 0) {
                            throw `TODO: compiler does not support generic interface methods yet`;
                        }
                        const methodArguments = m.arguments.map(arg => graph.insert("DeclareVar", {
                            declare: "var",
                            name: arg.name,
                            type: graphyType(arg.type, instanceScope),
                        }));
                        const argumentScope = graph.insert("Scope", {
                            parent: instanceScope,
                            inScope: {},
                        });
                        for (let argument of methodArguments) {
                            if (argumentScope.in(graph).inScope[argument.in(graph).name.text]) {
                                throw `TODO: interface method argument in implementation uses repeated name`;
                            }
                            argumentScope.in(graph).inScope[argument.in(graph).name.text] = argument;
                        }
                        let methodReference = graph.insert("DeclareFunction",  {
                            declare: "function",
                            name: m.name,
                            scale: {scale: "instance", unique: "inst_" + uniqueName()},
                            effects: m.effects,
                            generics: generics,
                            arguments: methodArguments,
                            returns: m.returns ? graphyType(m.returns, argumentScope) : null,
                            body: graphyBlock(m.body, argumentScope),
                        });
                        argumentScope.in(graph).returnsFrom = methodReference;
                        return methodReference;
                    }),
                });
            } else if (declaration.declare == "effect") {
                throw "TODO: implement effect declarations";
            } else if (declaration.declare == "service") {
                throw "TODO: implement services";
            } else {
                const impossible: never = declaration;
            }
        }

        graph.each("DeclareFunction", f => {
            if (f.returns && f.returns.type == "TypeBorrow") {
                throw `functions cannot return references, but function ${f.name.text} at ${f.name.location} does`;
            }
        });
        graph.each("DeclareStruct", s => {
            for (let field of s.fields) {
                if (field.type.type == "TypeBorrow") {
                    throw `structs cannot have reference fields, but struct ${s.name.text} at ${s.name.location} does`;
                }
            }
        });
        graph.each("DeclareEnum", e => {
            for (let variant of e.variants) {
                if (variant.type && variant.type.type == "TypeBorrow") {
                    throw `enums cannot have reference fields, but struct ${e.name.text} at ${e.name.location} does`;
                }
            }
        });

        function lookupScope(graph: GraphOf<{Scope: ProgramGraph["Scope"]}>, scope: Ref<"Scope">, name: string): DeclareRef | null {
            let reference = scope.in(graph);
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
                        const declaration = lookup.in(graph);
                        if (named.parameters.length != declaration.parameterCount) {
                            throw `builtin type '${named.name.text}' at ${named.name.location} expects ${declaration.parameterCount} generic parameters but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareStruct") {
                        const declaration = lookup.in(graph);
                        if (named.parameters.length != declaration.generics.length) {
                            throw `struct type '${named.name.text}' referenced at ${named.name.location} expects ${declaration.generics.length} generic parameters (defined at ${declaration.name.location}) but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareEnum") {
                        const declaration = lookup.in(graph);
                        if (named.parameters.length != declaration.generics.length) {
                            throw `struct type '${named.name.text}' referenced at ${named.name.location} expects ${declaration.generics.length} generic parameters (defined at ${declaration.name.location}) but got ${named.parameters.length}`;
                        }
                        return lookup;
                    } else if (lookup.type == "DeclareGeneric") {
                        const declaration = lookup.in(graph);
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
        const graphN = graphK.compute<
            {
                ExpressionVariable: {variableDeclaration: Ref<"DeclareVar"> | Ref<"DeclareFunction"> | Ref<"DeclareBuiltinVar"> | Ref<"DeclareMethod">}, 
                DeclareGeneric: {constraints: Ref<"DeclareInterface">[]},
                StatementDiscard: {decl: Ref<"DeclareVar">},
            }
        >({
            ExpressionVariable: {
                variableDeclaration: (self, result): Ref<"DeclareVar"> | Ref<"DeclareFunction"> | Ref<"DeclareBuiltinVar"> | Ref<"DeclareMethod"> => {
                    const lookup = lookupScope(result, self.scope, self.variable.text);
                    if (!lookup) {
                        throw `variable name '${self.variable.text}' at ${self.variable.location} is not in scope.`;
                    }
                    if (lookup.type == "DeclareVar") {
                        return lookup;
                    }
                    if (lookup.type == "DeclareFunction") {
                        return lookup;
                    }
                    if (lookup.type == "DeclareBuiltinVar") {
                        return lookup;
                    }
                    if (lookup.type == "DeclareMethod") {
                        return lookup;
                    }
                    throw `'${self.variable.text}' does not name a variable or function at ${self.variable.location}`;
                },
            },
            DeclareGeneric: {
                constraints: (self, result) => {
                    let constraints: Ref<"DeclareInterface">[] = [];
                    for (let name of self.constraintNames) {
                        let looked = lookupScope(result, self.scope, name.text);
                        if (!looked) {
                            throw `generic variable '${self.name.text}' at ${self.name.location} refers to unknown constraint name '${name.text}' at ${name.location}`;
                        }
                        if (looked.type != "DeclareInterface") {
                            throw `generic variable '${self.name.text}' at ${self.name.location} refers to non-interface name as constraint '${name.text}' at ${name.location}`;
                        }
                        constraints.push(looked);
                    }
                    return constraints;
                },
            },
            StatementDiscard: {
                decl: (self, result): Ref<"DeclareVar"> => {
                    const decl = lookupScope(result, self.scope, self.name.text);
                    if (!decl) {
                        throw `cannot discard unknown variable '${self.name.text}' at ${self.name.location}`;
                    }
                    if (decl.type != "DeclareVar") {
                        throw `cannot discard non-variable '${self.name.text}' at ${self.name.location}`;
                    }
                    return decl;
                },
            }
        });
        
        type TypeIdenticalShape = {
            TypeName: {type: "name", name: Token, parameters: TypeRef[], typeDeclaration: Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareGeneric"> | Ref<"DeclareBuiltinType">},
            TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[], returns: null | TypeRef},
            TypeSelf: {type: "self"},
            TypeBorrow: {type: "borrow", mutable: boolean, reference: TypeRef},
        }
        function typeIdentical(t1: TypeRef, t2: TypeRef, g: GraphOf<TypeIdenticalShape>, equal: ReadonlyArray<{a: Ref<"DeclareGeneric">, b: Ref<"DeclareGeneric">}> = []): boolean {
            if (t1 == t2) {
                return true;
            }
            if (t1.type == "TypeName") {
                if (t2.type != "TypeName") {
                    return false;
                }
                const n1 = t1.in(g);
                const n2 = t2.in(g);
                if (n1.typeDeclaration != n2.typeDeclaration) {
                    return false;
                }
                for (let i = 0; i < n1.parameters.length; i++) {
                    if (!typeIdentical(n1.parameters[i], n2.parameters[i], g, equal)) {
                        return false;
                    }
                }
                return true;
            } else if (t1.type == "TypeSelf") {
                if (t2.type == "TypeSelf") {
                    return true;
                }
                return false;
            } else if (t1.type == "TypeFunction") {
                if (t2.type != "TypeFunction") {
                    return false;
                }
                const f1 = t1.in(g);
                const f2 = t2.in(g);
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
            } else if (t1.type == "TypeBorrow") {
                if (t2.type != "TypeBorrow") {
                    return false;
                }
                return t1.in(g).mutable == t2.in(g).mutable && typeIdentical(t1.in(g).reference, t2.in(g).reference, g, equal);
            } else {
                const impossible: never = t1;
                return impossible;
            }
        }

        type TypeSubstituteShape = {
            TypeName: {type: "name", name: Token, typeDeclaration: Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareGeneric"> | Ref<"DeclareBuiltinType">, parameters: TypeRef[]},
            TypeSelf: {type: "self"},
            TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[], returns: null | TypeRef},
            TypeBorrow: {type: "borrow", mutable: boolean, reference: TypeRef},
        }
        function typeSubstitute(t: TypeRef, g: GraphOf<TypeSubstituteShape>, variables: Map<Ref<"DeclareGeneric">, TypeRef>): TypeRef {
            if (t.type == "TypeName") {
                const n = t.in(g);
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
                    typeDeclaration: n.typeDeclaration,
                });
            } else if (t.type == "TypeSelf") {
                return t;
            } else if (t.type == "TypeFunction") {
                const f = t.in(g);
                return g.insert("TypeFunction", {
                    type: "function",
                    effects: f.effects,
                    generics: f.generics,
                    arguments: f.arguments.map(a => typeSubstitute(a, g, variables)),
                    returns: f.returns ? typeSubstitute(f.returns, g, variables) : null,
                });
            } else if (t.type == "TypeBorrow") {
                const b = t.in(g);
                return g.insert("TypeBorrow", {
                    type: "borrow",
                    mutable: b.mutable,
                    reference: typeSubstitute(b.reference, g, variables),
                })
            } else {
                const impossible: never = t;
                return impossible;
            }
        }
        function typeSelfSubstitute(t: TypeRef, g: GraphOf<TypeSubstituteShape>, replaced: TypeRef): TypeRef {
            if (t.type == "TypeName") {
                const n = t.in(g);
                return g.insert("TypeName", {
                    type: "name",
                    name: n.name,
                    parameters: n.parameters.map(p => typeSelfSubstitute(p, g, replaced)),
                    typeDeclaration: n.typeDeclaration,
                });
            } else if (t.type == "TypeSelf") {
                return replaced;
            } else if (t.type == "TypeFunction") {
                // TODO: efficiency; avoid copying if there's no change.
                const f = t.in(g);
                return g.insert("TypeFunction", {
                    type: "function",
                    effects: f.effects,
                    generics: f.generics,
                    arguments: f.arguments.map(a => typeSelfSubstitute(a, g, replaced)),
                    returns: f.returns ? typeSelfSubstitute(f.returns, g, replaced) : null,
                });
            } else if (t.type == "TypeBorrow") {
                const b = t.in(g);
                return g.insert("TypeBorrow", {
                    type: "borrow",
                    mutable: b.mutable,
                    reference: typeSelfSubstitute(b.reference, g, replaced),
                })
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
                const againstName: {
                    type: "name";
                    name: Token;
                    parameters: TypeRef[];
                    typeDeclaration: Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareGeneric"> | Ref<"DeclareBuiltinType">;
                } = against.in(result);
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
            } else if (pattern.type == "TypeSelf") {
                if (against.type != "TypeSelf") {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                return true;
            } else if (pattern.type == "TypeFunction") {
                if (against.type != "TypeFunction") {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                const patternFunction: {
                    type: "function";
                    effects: Token[];
                    generics: Ref<"DeclareGeneric">[];
                    arguments: TypeRef[];
                    returns: TypeRef | null;
                } = pattern.in(result);
                const againstFunction: {
                    type: "function";
                    effects: Token[];
                    generics: Ref<"DeclareGeneric">[];
                    arguments: TypeRef[];
                    returns: TypeRef | null;
                } = against.in(result);
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
            } else if (pattern.type == "TypeBorrow") {
                if (against.type != "TypeBorrow") {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                if (pattern.in(result).mutable != against.in(result).mutable) {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
                }
                return matchType(unified, result, pattern.in(result).reference, against.in(result).reference, equivalent);
            } else {
                const impossible: never = pattern;
                return impossible;
            }
        }

        const expectedType = new Map<ExpressionRef, TypeRef>();
        graphN.each("StatementVar", s => {
            expectedType.set(s.expression, graphN.get(s.declare).type);
        });

        type PrettyTypeShape = {
            TypeName: { type: "name", name: Token, parameters: TypeRef[] },
            TypeFunction: { type: "function", arguments: TypeRef[], returns: null | TypeRef },
            TypeSelf: { type: "self", },
            TypeBorrow: {type: "borrow", mutable: boolean, reference: TypeRef},
        }

        function prettyType(t: TypeRef, g: GraphOf<PrettyTypeShape>): string {
            const ts = g.get(t);
            if (ts.type == "name") {
                if (ts.parameters.length == 0) {
                    return ts.name.text;
                } else {
                    return ts.name.text + "[" + ts.parameters.map(p => prettyType(p, g)).join(", ") + "]";
                }
            } else if (ts.type == "self") {
                return "self";
            } else if (ts.type == "function") {
                return "func(" + ts.arguments.map(a => prettyType(a, g)).join(", ") + ")" + (ts.returns ? "->" + prettyType(ts.returns, g) : "");
            } else if (ts.type == "borrow") {
                return (ts.mutable ? "&mut " : "& ") + prettyType(ts.reference, g);
            } else {
                const impossible: never = ts;
                return impossible;
            }
        }

        type PrettyExpressionShape = {
            ExpressionInteger:  {type: "integer",  at: Token, value: Token},
            ExpressionString:   {type: "string",   at: Token, value: Token},
            ExpressionBoolean:  {type: "boolean",  at: Token, value: Token},
            ExpressionVariable: {type: "variable", at: Token, variable: Token},
            ExpressionDot:      {type: "dot",      at: Token, object: ExpressionRef, field: Token},
            ExpressionCall:     {type: "call",     at: Token, hasEffect: boolean, func: ExpressionRef, arguments: ExpressionRef[]},
            ExpressionOperator: {type: "operator", at: Token, operator: Token, func: ExpressionRef, left: ExpressionRef | null, right: ExpressionRef},
            ExpressionObject:   {
                type: "object",
                at: Token,
                name: Token,
                contents: {type: "fields", fields: {name: Token, value: ExpressionRef}[]} | {type: "empty"} | {type: "single", value: ExpressionRef},
            },
            ExpressionArray:    {type: "array",    at: Token, fields: ExpressionRef[]},
            ExpressionBorrow:   {type: "borrow",   at: Token, reference: ReferenceRef},
            ExpressionForeign:  {type: "foreign", at: Token},
        };
        function prettyExpression(e: ExpressionRef, g: GraphOf<PrettyExpressionShape>): string {
            const es = g.get(e);
            if (es.type == "string") {
                return `${es.value.text}`;
            } else if (es.type == "object") {
                if (es.contents.type == "fields") {
                    return `#${es.name.text}{ ${es.contents.fields.map(({name, value}) => name.text + " => " + prettyExpression(value, g) + ",").join(" ")} }`
                } else if (es.contents.type == "single") {
                    return `#${es.name.text}(${prettyExpression(es.contents.value, g)})`;
                } else if (es.contents.type == "empty") {
                    return `#${es.name.text}`;
                } else {
                    const impossible: never = es.contents;
                    return impossible;
                }
            } else if (es.type == "integer") {
                return `${es.value.text}`;
            } else if (es.type == "boolean") {
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
            } else if (es.type == "borrow") {
                return `&(...)`;
            } else if (es.type == "foreign") {
                return `foreign# ... #`;
                // TODO
            } else {
                const impossible: never = es;
                return impossible;
            }
        }

        // remove the scope from types, where it is no longer needed (since they've been resolved).
        const graphN1 = graphN.ignoreFields({
            ExpressionInteger:  {type: "integer",  at: null, value: null},
            ExpressionString:   {type: "string",   at: null, value: null},
            ExpressionBoolean:  {type: "boolean",  at: null, value: null},
            ExpressionVariable: {type: "variable", at: null, variable: null, variableDeclaration: null},
            ExpressionDot:      {type: "dot",      at: null, object: null, field: null},
            ExpressionCall:     {type: "call",     at: null, hasEffect: null, func: null, arguments: null},
            ExpressionOperator: {type: "operator", at: null, operator: null, func: null, left: null, right: null},
            ExpressionObject:   {
                type: "object",
                at: null,
                scope: null,
                name: null,
                contents: null,
            },
            ExpressionArray:    {type: "array",   at: null, fields: null},
            ExpressionBorrow:   {type: "borrow",  at: null, mutable: null, reference: null},
            ExpressionForeign:  {type: "foreign", at: null, scope: null},
            // TODO: map/array access
            ReferenceVar: {type: "variable", at: null, scope: null, name: null},
            ReferenceDot: {type: "dot",      at: null, scope: null, object: null, field: null},
            // TODO: for
            StatementDo:       {is: "do",       at: null, expression: null},
            StatementVar:      {is: "var",      at: null, declare: null, expression: null},
            StatementAssign:   {is: "assign",   at: null, scope: null, reference: null, expression: null},
            StatementReturn:   {is: "return",   at: null, scope: null, expression: null},
            StatementBreak:    {is: "break",    at: null, scope: null},
            StatementContinue: {is: "continue", at: null, scope: null},
            StatementIf:       {is: "if",       at: null, condition: null,  then: null, otherwise: null},
            StatementWhile:    {is: "while",    at: null, condition: null, body: null},
            StatementMatch:    {is: "match",    at: null, expression: null, branches: null},
            StatementDiscard:  {is: "discard",  at: null, name: null, decl: null},
            StatementBlock:    {is: "block",    at: null, body: null},
        
            TypeSelf:     {type: "self", self: null},
            TypeName:     {type: "name", name: null, parameters: null, typeDeclaration: null},
            TypeFunction: {type: "function", effects: null, generics: null, arguments: null, returns: null},
            TypeBorrow:   {type: "borrow", mutable: null, reference: null},
        
            DeclareBuiltinType: {declare: "builtin-type", name: null, linear: null, parameterCount: null}, // TODO: constraints on parameters?
            DeclareBuiltinVar:  {declare: "builtin-var",  name: null, valueType: null},
            DeclareGeneric:     {declare: "generic",      name: null, linear: null, constraintNames: null, scope: null, constraints: null},
            DeclareStruct:      {declare: "struct",       name: null, generics: null, fields: null},
            DeclareEnum:        {declare: "enum",         name: null, generics: null, variants: null},
            DeclareVariant:     {declare: "variant",      name: null, owner: null},
            DeclareFunction:    {declare: "function",     name: null, scale: null, effects: null, generics: null, arguments: null, returns: null, body: null},
            DeclareMethod:      {declare: "method",       name: null, interface: null, type: null, valueType: null},
            DeclareInterface:   {declare: "interface",    name: null, methods: null},
            DeclareInstance:    {declare: "instance",     name: null, type: null, generics: null, methods: null},
            DeclareVar:         {declare: "var",          name: null, type: null},
        
            SatisfyInstance: {declare: "instance", interface: null, source: null, generics: null}, // TODO: non-struct instances
        
            Scope: {
                parent: null,
                returnsFrom: null,
                allowsSelf: null,
                breaksFrom: null,
                inScope: null,
            },
        });

        const singletonInstanceMap: Map<Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareBuiltinType">, Ref<"DeclareInstance">> = new Map();
        // The singletonInstanceMap is an evil global variable that holds all instance declarations.
        // These exclude local ones (like those from DeclareGeneric) because you can already determine where those are from.
        // This is also the point that we verify that these instances satisfy the interface required.

        let instanceID = 1000;

        const graphN2 = graphN1.compute<{DeclareInstance: {implements: Ref<"DeclareInterface">, creatorID: string}}>({
            DeclareInstance: {
                implements: (inst, result) => {
                    // check the inst!
                    const instanceInterfaceRef = lookupScope(graphN1, globalScope, inst.name.text);
                    if (instanceInterfaceRef == null) {
                        throw `cannot satisfy unknown interface '${inst.name.text}' at ${inst.name.location}`; // TODO: error details
                    }
                    if (instanceInterfaceRef.type != "DeclareInterface") {
                        throw `cannot satisfy non-interface in instance declaration`; // TODO: error details
                    }
                    return instanceInterfaceRef;
                },
                creatorID: (inst, result, instRef) => {
                    const instanceInterfaceRef = inst.implements;
                    const instanceInterface = graphN1.get(instanceInterfaceRef);
                    if (inst.methods.length != instanceInterface.methods.length) {
                        throw `instance for interface has wrong number of methods`; // TODO: error details
                    }
                    for (let i = 0; i < inst.methods.length; i++) {
                        // TODO: do this in an order-independent fashion
                        const instanceMethod = graphN1.get(inst.methods[i]);
                        const interfaceMethod = graphN1.get(instanceInterface.methods[i]);
                        if (instanceMethod.name.text != interfaceMethod.name.text) {
                            throw `TODO: lazy interface check sees that methods are given in wrong order or are misnamed`; // TODO: error details
                        }
                        const expectedTypeTemplate = interfaceMethod.type;
                        const expectedTypeParticular = typeSelfSubstitute(expectedTypeTemplate, graphN1, inst.type);
                        if (!typeIdentical(expectedTypeParticular,  graphN1.insert("TypeFunction", {
                            type: "function",
                            generics: [], // TODO: generics in instance methods
                            effects: [], // TODO: effects in instance methods?
                            arguments: instanceMethod.arguments.map(a => graphN1.get(a).type),
                            returns: instanceMethod.returns,
                        }), graphN1)) {
                            throw `method ${instanceMethod.name.text} has wrong type`// TODO: error details
                        }
                    }

                    const instanceTypeRef = inst.type;
                    // verify the instance matches the interface
                    const instanceTypeDeclaration = graphN.get(instanceTypeRef).typeDeclaration;
                    if (instanceTypeDeclaration.type == "DeclareStruct" || instanceTypeDeclaration.type == "DeclareEnum" || instanceTypeDeclaration.type == "DeclareBuiltinType") {
                        singletonInstanceMap.set(instanceTypeDeclaration, instRef);
                    } else {
                        throw `instance declarations must be for struct or enum types`; // TODO: error details
                    }
                    return "instance_generator_" + (instanceID++);
                }
            }
        });

        // TODO: in order to support partial inference,
        // change this to a 2-pass or n-pass scheme, where some types have values inferred,
        // while others create expectations for their children.
        // This allows us to (for example) handle ```var x: Int = read("5");```
        // which otherwise can't be done, as read's generic parameters are unknown.
        const graphT = graphN2.compute<{
            [k in ExpressionRef["type"]]: {expressionType: TypeRef}
        } & {
            ExpressionCall: {genericTypes: TypeRef[]}
        } & {
            ExpressionOperator: {genericTypes: TypeRef[]}
        } & {
            ExpressionObject: {declaration: Ref<"DeclareStruct"> | Ref<"DeclareVariant">}
        } & {
            ExpressionDot: {objectType: {byReference: boolean, type: Ref<"TypeName">}, structDeclaration: {byReference: boolean, struct: Ref<"DeclareStruct">}},
        } & {
            ReferenceVar: {referenceType: TypeRef, referenceTo: Ref<"DeclareVar">},
            ReferenceDot: {referenceType: TypeRef}
        } & {
            ReferenceDot: {referenceStruct: Ref<"DeclareStruct">},
        }>({
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
            ExpressionBoolean: {
                expressionType: () => {
                    return builtinTypeNames.Bool;
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
                    } else if (self.variableDeclaration.type == "DeclareBuiltinVar") {
                        return graphN.get(self.variableDeclaration).valueType;
                    } else if (self.variableDeclaration.type == "DeclareMethod") {
                        return result.get(self.variableDeclaration).valueType;
                    } else {
                        const impossible: never = self.variableDeclaration;
                        return impossible;
                    }
                },
            },
            ExpressionDot: {
                objectType: (self, result): {byReference: boolean, type: Ref<"TypeName">} => {
                    const objectTypeRef = result.get(self.object).expressionType;
                    const objectType = result.get(objectTypeRef);
                    if (objectTypeRef.type == "TypeBorrow") {
                        const interiorRef = objectTypeRef.in(result).reference;
                        if (interiorRef.type != "TypeName" || objectTypeRef.in(result).mutable) {
                            throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-named type`;
                        }
                        return {byReference: true, type: interiorRef};
                    }
                    if (objectTypeRef.type != "TypeName") {
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-named type`;
                    }
                    return {byReference: false, type: objectTypeRef};
                },
                structDeclaration: (self, result): {byReference: boolean, struct: Ref<"DeclareStruct">} => {
                    const objectTypeDeclaration = result.get(self.objectType.type).typeDeclaration;
                    if (objectTypeDeclaration.type != "DeclareStruct") {
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-struct type`;
                    }
                    return {byReference: self.objectType.byReference, struct: objectTypeDeclaration};
                },
                expressionType: (self, result) => {
                    const objectTypeRef = result.get(self.object).expressionType;
                    const objectType = result.get(objectTypeRef);
                    const structDeclaration = result.get(self.structDeclaration.struct);
                    const variables = new Map<Ref<"DeclareGeneric">, TypeRef>();
                    for (let i = 0; i < structDeclaration.generics.length; i++) {
                        variables.set(structDeclaration.generics[i], result.get(self.objectType.type).parameters[i]);
                    }
                    for (let structField of structDeclaration.fields) {
                        if (structField.name.text == self.field.text) {
                            // Find the type of the field.
                            const fieldType = typeSubstitute(structField.type, result, variables);
                            if (self.structDeclaration.byReference) {
                                return result.insert("TypeBorrow", {
                                    type: "borrow",
                                    mutable: false,
                                    reference: fieldType,
                                });
                            }
                            return fieldType;
                        }
                    }
                    throw `cannot access field '${self.field.text}' at ${self.field.location} on object with struct type '${structDeclaration.name.text}' declared at ${structDeclaration.name.location}`;
                }
            },
            ExpressionCall: {
                genericTypes: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    if (funcType.type != "TypeFunction") {
                        throw `cannot call non-function '${prettyExpression(self.func, result)}' at ${self.at.location}`;
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != self.arguments.length) {
                        throw `cannot call function '${prettyExpression(self.func, result)}' at ${self.at.location} with wrong number of arguments; expected ${functionType.arguments.length} but got ${self.arguments.length}`;
                    }
                    if (functionType.effects.length != 0) {
                        if (!self.hasEffect) {
                            throw `cannot perform call '${prettyExpression(selfRef, result)}' at ${self.at.location} without bang to invoke effects`;
                        }
                    }
                    if (functionType.effects.length == 0) {
                        if (self.hasEffect) {
                            throw `cannot perform call '${prettyExpression(selfRef, result)}' at ${self.at.location} with bang since function has no effects`;
                        }
                    }
                    const unified = new Map<Ref<"DeclareGeneric">, TypeRef[]>();
                    for (let generic of functionType.generics) {
                        unified.set(generic, []);
                    }
                    for (let i = 0; i < functionType.arguments.length; i++) {
                        let message = matchType(unified, result, functionType.arguments[i], result.get(self.arguments[i]).expressionType, new Map());
                        if (message !== true) {
                            throw `cannot match type of argument ${i+1} at ${result.get(self.arguments[i]).at.location} in ${prettyExpression(selfRef, graph)} with expected type ${prettyType(functionType.arguments[i], result)}: ${message}`;
                        }
                    }
                    if (functionType.returns && expectedType.has(selfRef)) {
                        let message = matchType(unified, result, functionType.returns, expectedType.get(selfRef)!, new Map());
                        if (message !== true) {
                            throw `cannot match return type of ${prettyExpression(selfRef, graph)} at ${self.at.location} with expected type ${prettyType(expectedType.get(selfRef)!, result)}; actual return type is ${prettyType(functionType.returns, result)}`;
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
                            throw `generic parameter '${result.get(generic).name.text}' at ${self.at.location} cannot be inferred from arguments or calling context`;
                        }
                        for (let i = 1; i < assign.length; i++) {
                            if (!typeIdentical(assign[0], assign[1], result)) {
                                throw `generic parameter '${result.get(generic).name.text}' is inconsistently assigned to both ${prettyType(assign[0], result)} and ${prettyType(assign[i], result)} at ${self.at.location}`;
                            }
                        }
                        answer.push(assign[0]);
                    }
                    for (let i = 0; i < functionType.generics.length; i++) {
                        if (answer[i].type == "TypeBorrow") {
                            throw `generic types cannot be borrowed values in function calls, but parameter '${functionType.generics[i].in(result).name.text}' for function used at ${self.at.location} is given a borrowed type`;
                        }
                        if (!functionType.generics[i].in(result).linear && isLinearType(answer[i], result as any /* TODO evil */)) {
                            throw `linear types cannot be passed into non-linear generics in function calls, but parameter '${functionType.generics[i].in(result).name.text}' for function used at ${self.at.location} is given a linear type`;
                        }
                    }
                    return answer;
                },
                expressionType: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    if (funcType.type != "TypeFunction") {
                        throw `cannot call non-function '${prettyExpression(self.func, result)}' at ${self.at.location}`;
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != self.arguments.length) {
                        throw `cannot call function '${prettyExpression(self.func, result)}' with wrong number of arguments; got ${self.arguments.length} but ${functionType.arguments.length} expected at ${self.at.location}`;
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
            ExpressionOperator: {
                genericTypes: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    const operatorArguments = self.left == null ? [self.right] : [self.left, self.right];
                    if (funcType.type != "TypeFunction") {
                        throw `operator '${self.operator.text}' refers to non-function value '${prettyExpression(self.func, result)}' at ${self.at.location}`;
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != (self.left == null ? 1 : 2)) {
                        throw `operator '${self.operator.text}' refers to function of incorrect arity ${functionType.arguments.length} '${prettyExpression(self.func, result)}' at ${self.at.location} with wrong number of arguments; expected ${functionType.arguments.length} but got ${operatorArguments.length}`;
                    }
                    if (functionType.effects.length != 0) {
                        throw `operators cannot invoke effectful functions but '${prettyExpression(selfRef, result)}' at ${self.at.location} without bang to invoke effects`;
                    }
                    const unified = new Map<Ref<"DeclareGeneric">, TypeRef[]>();
                    for (let generic of functionType.generics) {
                        unified.set(generic, []);
                    }
                    for (let i = 0; i < functionType.arguments.length; i++) {
                        let message = matchType(unified, result, functionType.arguments[i], result.get(operatorArguments[i]).expressionType, new Map());
                        if (message !== true) {
                            throw `cannot match type of argument ${i+1} at ${result.get(operatorArguments[i]).at.location} in ${prettyExpression(selfRef, graph)} with expected type ${prettyType(functionType.arguments[i], result)}: ${message}`;
                        }
                    }
                    if (functionType.returns && expectedType.has(selfRef)) {
                        let message = matchType(unified, result, functionType.returns, expectedType.get(selfRef)!, new Map());
                        if (message !== true) {
                            throw `cannot match return type of ${prettyExpression(selfRef, graph)} at ${self.at.location} with expected type ${prettyType(expectedType.get(selfRef)!, result)}; actual return type is ${prettyType(functionType.returns, result)}`;
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
                            throw `generic parameter '${result.get(generic).name.text}' at ${self.at.location} cannot be inferred from arguments or calling context`;
                        }
                        for (let i = 1; i < assign.length; i++) {
                            if (!typeIdentical(assign[0], assign[1], result)) {
                                throw `generic parameter '${result.get(generic).name.text}' is inconsistently assigned to both ${prettyType(assign[0], result)} and ${prettyType(assign[i], result)} at ${self.at.location}`;
                            }
                        }
                        answer.push(assign[0]);
                    }
                    for (let i = 0; i < functionType.generics.length; i++) {
                        if (answer[i].type == "TypeBorrow") {
                            throw `generic types cannot be borrowed values in function calls, but parameter '${functionType.generics[i].in(result).name.text}' for operator used at ${self.at.location} is given a borrowed type`;
                        }
                    }
                    return answer;
                },
                expressionType: (self, result, selfRef) => {
                    const funcType = result.get(self.func).expressionType;
                    const operatorArguments = self.left == null ? [self.right] : [self.left, self.right];
                    if (funcType.type != "TypeFunction") {
                        throw `cannot call non-function '${prettyExpression(self.func, result)}' at ${self.at.location}`;
                    }
                    const functionType = result.get(funcType);
                    if (functionType.arguments.length != operatorArguments.length) {
                        throw `cannot call function '${prettyExpression(self.func, result)}' with wrong number of arguments; got ${operatorArguments.length} but ${functionType.arguments.length} expected at ${self.at.location}`;
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
                                throw `expected type '${prettyType(expectedType.get(selfRef)!, result)}' but got an empty array at ${self.at.location}`;
                            }
                            if (expected.typeDeclaration != builtins.Array) {
                                throw `expected type '${prettyType(expectedType.get(selfRef)!, result)}' but got an empty array at ${self.at.location}`;
                            }
                            return expectedType.get(selfRef)!;
                        }
                        throw `empty literal array at ${self.at.location} is ambiguous because its element type is uncertain; assign into a typed variable to resolve ambiguity`;
                    }
                    for (let i = 1; i < self.fields.length; i++) {
                        if (!typeIdentical(result.get(self.fields[0]).expressionType, result.get(self.fields[i]).expressionType, result)) {
                            throw `array literal '${prettyExpression(selfRef, result)}' at ${self.at.location} contains values with different types`;
                        }
                    }
                    return result.insert("TypeName", {
                        type: "name",
                        name: {type: "special", text: "Array", location: "<builtin>"},
                        parameters: [result.get(self.fields[0]).expressionType],
                        typeDeclaration: builtins.Array,
                    });
                }
            },
            ExpressionObject: {
                declaration: (self, result, selfRef): Ref<"DeclareStruct"> | Ref<"DeclareVariant"> => {
                    const declaration = lookupScope(result, self.scope, self.name.text);
                    if (!declaration) {
                        throw `type '${self.name.text}' at ${self.name.location} is not in scope in ${prettyExpression(selfRef, result)}`;
                    }
                    if (declaration.type == "DeclareStruct" || declaration.type == "DeclareVariant") {
                        return declaration;
                    }
                    throw `name '${self.name.text}' at ${self.name.location} does not name a struct type or enum variant, in ${prettyExpression(selfRef, result)}`;
                },
                expressionType: (self, result, selfRef) => {
                    let name = self.name;
                    const declaration = self.declaration;
                    if (declaration.type == "DeclareStruct") {
                        const struct = result.get(declaration);
                        let expectedTypeByName: {[name: string]: TypeRef} = {};
                        let actualTypeByName: {[name: string]: TypeRef} = {};
                        let setFieldByName : {[name: string]: boolean} = {};
                        for (let field of struct.fields) {
                            expectedTypeByName[field.name.text] = field.type;
                        }
                        if (self.contents.type != "fields") {
                            throw `struct cannot be initialized by non-field set construct at ${prettyExpression(selfRef, result)}`;
                        }
                        for (let field of self.contents.fields) {
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
                                throw `struct literal assignment for field '${fieldName}' in struct literal at ${name.location} has wrong type; expected ${prettyType(expectedTypeByName[fieldName], result)} but got ${prettyType(actualTypeByName[fieldName], result)}`;
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
                        for (let generic of struct.generics) {
                            if (unified.get(generic)![0].type == "TypeBorrow") {
                                throw `generic types cannot be assigned reference values but for struct object '${self.name.text}' at ${self.name.location} variable ${generic.in(result).name.text} is`;
                            }
                        }
                        return result.insert("TypeName", {
                            type: "name",
                            name: struct.name,
                            parameters: struct.generics.map(g => unified.get(g)![0]),
                            typeDeclaration: declaration,
                        });    
                    } else {
                        if (self.contents.type == "fields") {
                            throw `variant object with name '${self.name.text}' at ${self.name.location} cannot have fields`;
                        }
                        if (expectedType.has(selfRef)) {
                            const exactExpected = expectedType.get(selfRef)!;
                            if (exactExpected.type != "TypeName") {
                                throw `variant object with name '${self.name.text}' at ${self.name.location} must be used to create named type; it cannot be used to make an object with type ${prettyType(exactExpected, result)}`;
                            }
                            const nameRefersTo = exactExpected.in(result).typeDeclaration;
                            if (nameRefersTo.type != "DeclareEnum") {
                                throw `variant object with name '${self.name.text}' at ${self.name.location} must be used to create named enum type; it cannot be used to make an object with type ${prettyType(exactExpected, result)}`;
                            }
                            for (let variant of nameRefersTo.in(result).variants) {
                                if (variant.name.text == self.name.text) {
                                    if (self.contents.type == "empty") {
                                        if (variant.type) {
                                            throw `cannot construct ${prettyExpression(selfRef, result)} at ${self.name.location}: variant ${self.name.text} defined at ${variant.name.location} expects a parameter`;
                                        }
                                        return exactExpected;
                                    } else {
                                        if (!variant.type) {
                                            throw `cannot construct ${prettyExpression(selfRef, result)} at ${self.name.location}: variant ${self.name.text} defined at ${variant.name.location} does not expect a parameter`;
                                        }
                                        // figure out what the type should be by substituting generic variables.
                                        const replace: Map<Ref<"DeclareGeneric">, TypeRef> = new Map();
                                        const expectedParameters = exactExpected.in(result).parameters;
                                        const definitionParameters = nameRefersTo.in(result).generics;
                                        for (let i = 0; i < expectedParameters.length; i++) {
                                            replace.set(definitionParameters[i], expectedParameters[i]);
                                        }
                                        const valueShouldBe = typeSubstitute(variant.type!, result, replace);
                                        if (!typeIdentical(valueShouldBe, result.get(self.contents.value).expressionType, result)) {
                                            throw `cannot construct ${prettyExpression(selfRef, result)} at ${self.name.location}: variant ${self.name.text} defined at ${variant.name.location} expects a parameter with type ${prettyType(valueShouldBe, result)}`;
                                        }
                                        for (let [generic, t] of replace) {
                                            if (t.type == "TypeBorrow") {
                                                throw `generic types cannot be assigned reference values but for struct object '${self.name.text}' at ${self.name.location} variable ${generic.in(result).name.text} is`;
                                            }
                                        }
                                        return exactExpected;
                                    }
                                }
                            }
                            throw `expression ${prettyExpression(selfRef, result)} at ${self.name.location} does not have expected type ${prettyType(exactExpected, result)}`;
                        } else {
                            // different rules: guess the type by the parameter, if any
                            if (self.contents.type == "empty") {
                                console.log(self);
                                if (declaration.in(result).owner.in(result).generics.length != 0) {
                                    throw `cannot construct ${prettyExpression(selfRef, result)} at ${self.name.location} because the type of its generic parameters cannot be determined from context; consider assigning it to a local variable.`;
                                }
                                return graph.insert("TypeName", {
                                    type: "name",
                                    name: declaration.in(result).owner.in(result).name,
                                    parameters: [],
                                    scope: self.scope,
                                });
                            }
                            // TODO:
                            // get the value's type,
                            // unify it with the expected one
                            // produce result type
                            throw "[TODO] variants must be used in contexts where their types can be determined";
                        }
                    }
                }
            },
            ExpressionBorrow: {
                expressionType: (self, result, selfRef): TypeRef => {
                    return result.insert("TypeBorrow", {
                        type: "borrow",
                        mutable: self.mutable,
                        reference: result.get(self.reference).referenceType,
                    });
                },
            },
            ExpressionForeign: {
                expressionType: (self, result, selfRef) => {
                    return result.insert("TypeName", {
                        type: "name",
                        name: {type: "special", text: "foreign", location: self.at.location},
                        parameters: [],
                        typeDeclaration: result.insert("DeclareBuiltinType", {
                            declare: "builtin-type",
                            name: {type: "special", text: "foreign", location: self.at.location},
                            linear: false,
                            parameterCount: 0,
                        })
                    });
                },
            },
            ReferenceVar: {
                referenceTo: (self, result): Ref<"DeclareVar"> => {
                    const declaration = lookupScope(result, self.scope, self.name.text);
                    if (!declaration) {
                        throw `variable reference '${self.name.text}' at ${self.name.location} does not refer to any name in scope.`;
                    }
                    if (declaration.type != "DeclareVar") {
                        throw `variable reference '${self.name.text}' at ${self.name.location} does not refer to a variable.`;
                    }
                    return declaration;
                    
                },
                referenceType: (self, result) => {
                    const variable = result.get(self.referenceTo);
                    return variable.type;
                },
            },
            ReferenceDot: {
                referenceStruct: (self, result): Ref<"DeclareStruct"> => {
                    const objectReference = result.get(self.object);
                    const objectType = result.get(objectReference.referenceType);
                    if (objectType.type != "name") {
                        throw `field access '${self.field.text}' at ${self.field.location} cannot be created since it is not of struct type (its type is ${prettyType(objectReference.referenceType, result)})`;
                    }
                    const typeDeclaration = objectType.typeDeclaration;
                    if (typeDeclaration.type != "DeclareStruct") {
                        throw `field access '${self.field.text}' at ${self.field.location} cannot be created since it is not of struct type (its type is ${prettyType(objectReference.referenceType, result)}`;
                    }
                    return typeDeclaration;
                    
                },
                referenceType: (self, result) => {
                    const objectReference = result.get(self.object);
                    const objectType = result.get(objectReference.referenceType);
                    if (objectType.type != "name") {
                        throw `struct field access at ${self.at.location} occurs on object with non-named type`;
                    }
                    const typeDeclaration = self.referenceStruct;
                    const structDeclaration = result.get(typeDeclaration);
                    if (structDeclaration.generics.length != objectType.parameters.length) {
                        throw `internal compiler error (2035): generic arities do not match`;
                    }
                    // Look for a field in the struct declaration with the name we want.
                    for (let structField of structDeclaration.fields) {
                        if (structField.name.text == self.field.text) {
                            // since they match, we should use this type (but first replace the generic variables)
                            const substitution = new Map<Ref<"DeclareGeneric">, TypeRef>();
                            for (let i = 0; i < structDeclaration.generics.length; i++) {
                                substitution.set(structDeclaration.generics[i], objectType.parameters[i]);
                            }
                            return typeSubstitute(structField.type, result, substitution);
                        }
                    }
                    throw `field access '${self.field.text}' at ${self.field.location} cannot be created since struct type '${structDeclaration.name.text}' declared at ${structDeclaration.name.location} has no field ${self.field.text}`;
                },
            },
        });


        type InstanceRequirement = boolean; // Ref<"DeclareInterface">[][]; // TODO: use this instead
        const instancesAvailable = new Map<Ref<"DeclareInterface">, Map<Ref<"DeclareGeneric">, InstanceRequirement>>();

        graphT.each("DeclareInterface", (_, ref) => {
            instancesAvailable.set(ref, new Map());
        });
        graphT.each("DeclareGeneric", (generic, ref) => {
            for (let constraint of generic.constraints) {
                instancesAvailable.get(constraint)!.set(ref, true); // TODO: set to []
            }
        });

        type InstanceSatisfaction = {
            cLocation: string, // where the instance can be found (later, full details)
            jsLocation: string,
        };
        // TODO: instances are more complex.
        // They can induce other requirements that must be checked.

        type Instance = {
            instanceFor: "generic",
            interface: string,
            generic: Ref<"DeclareGeneric">,
            constraintIndex: number,
        } | {
            instanceFor: "name",
            name: string,
            interface: string,
            instance: Ref<"DeclareInstance">,
            requirements: Instance[],
        };

        // operates on graphT.
        const findInstance = (t: TypeRef, c: Ref<"DeclareInterface">): Instance => {
            if (t.type == "TypeFunction") {
                throw `function types cannot satisfy interfaces`;
            }
            if (t.type == "TypeSelf") {
                throw `ICE: 2795; 'self' cannot occur in expression contexts where instances are requested`;
            }
            if (t.type == "TypeBorrow") {
                throw "borrowed types cannot satisfy interfaces";
            }
            const namedRef: Ref<"TypeName"> = t;
            const named = graphT.get(namedRef);
            const declRef = named.typeDeclaration;
            if (declRef.type == "DeclareGeneric") {
                const decl = graphT.get(declRef);
                let okay = false;
                let index = 0;
                for (let satisfies of decl.constraints) {
                    if (satisfies == c) {
                        okay = true;
                        break;
                    }
                    index++;
                }
                if (!okay) {
                    throw `generic type ${named.name.text} declared at ${named.name.location} does not satisfy interface ${graphT.get(c).name.text}`;
                }
                return {
                    instanceFor: "generic",
                    interface: graphT.get(c).name.text,
                    generic: declRef,
                    constraintIndex: index,
                };
            } else {
                // Look up the singleton in the global map.
                const instanceRef = singletonInstanceMap.get(declRef);
                if (!instanceRef) {
                    throw `type ${prettyType(t, graphT)} does not have an instance for interface ${graphT.get(c).name.text}`;
                }
                // Types must be finite, and therefore this will terminate.
                // This should be linear, all-in-all, at least in practice.
                const instance = graphT.get(instanceRef);
                const instancePass: Instance = {
                    instanceFor: "name",
                    name: named.name.text,
                    interface: graphT.get(c).name.text,
                    instance: instanceRef,
                    requirements: [],
                };
                for (let i = 0; i < instance.generics.length; i++) {
                    const parameterRequirements = graphT.get(instance.generics[i]).constraints;
                    const parameterProvided = named.parameters[i];
                    for (let parameterRequirement of parameterRequirements) {
                        const parameterInstance = findInstance(parameterProvided, parameterRequirement);
                        instancePass.requirements.push(parameterInstance);
                    }
                }
                return instancePass;
            }
        };
        const graphTI = graphT.compute<{ExpressionCall: {passInstances: Instance[]}, ExpressionOperator: {passInstances: Instance[]}}>({
            ExpressionCall: {
                passInstances: (call, result, ref) => {
                    const expectationRef = result.get(call.func).expressionType;
                    if (expectationRef.type != "TypeFunction") {
                        throw "ICE: 2795";
                    }
                    const instances: Instance[] = [];
                    const expectation = result.get(expectationRef);
                    for (let i = 0; i < expectation.generics.length; i++) {
                        const generic = result.get(expectation.generics[i]);
                        const provided = call.genericTypes[i];
                        for (let constraintRef of generic.constraints) {
                            const foundInstance = findInstance(provided, constraintRef);
                            instances.push(foundInstance);
                        }
                    }
                    return instances; 
                },
            },
            ExpressionOperator: {
                passInstances: (call, result, ref) => {
                    const expectationRef = result.get(call.func).expressionType;
                    if (expectationRef.type != "TypeFunction") {
                        throw "ICE: 2795";
                    }
                    const instances: Instance[] = [];
                    const expectation = result.get(expectationRef);
                    for (let i = 0; i < expectation.generics.length; i++) {
                        const generic = result.get(expectation.generics[i]);
                        const provided = call.genericTypes[i];
                        for (let constraintRef of generic.constraints) {
                            const foundInstance = findInstance(provided, constraintRef);
                            instances.push(foundInstance);
                        }
                    }
                    return instances;
                },
            },
        });
        // With expression type-checking complete, it is now possible to add statement type-checking.
        // This only rejects programs; it computes nothing that is useful for code generation, as far as I can see.
        const graphS = graphTI.compute<{[s in StatementRef["type"] | "StatementBlock"]: {checked: true}} & {StatementMatch: {enumType: Ref<"DeclareEnum">}}>({
            StatementDo: {
                checked: (self, result): true => {
                    const dropType = result.get(self.expression).expressionType;
                    if (dropType.type == "TypeName") {
                        const declaration = dropType.in(result).typeDeclaration;
                        if (declaration.type == "DeclareBuiltinType") {
                            if (declaration.in(result).linear) {
                                throw `cannot drop value of builtin linear type at ${self.at.location}`;
                            }
                            return true;
                        } else if (declaration.type == "DeclareStruct" || declaration.type == "DeclareEnum") {
                            throw `cannot drop value of (linear) struct/enum type '${dropType.in(result).name.text}' at ${self.at.location}`;
                        } else if (declaration.type == "DeclareGeneric") {
                            throw `cannot drop value of (linear) generic type at ${self.at.location}`;
                        } else {
                            const impossible: never = declaration;
                            return true;
                        }
                    }
                    if (dropType.type == "TypeFunction") {
                        throw `function values cannot be safely dropped, but this happened as ${self.at.location}`;
                    }
                    if (dropType.type == "TypeSelf") {
                        throw `self-typed values cannot be safely dropped, but this happened as ${self.at.location}`;
                    }
                    return true;
                },
            },
            StatementVar: {
                checked: (self, result) => {
                    const variable = result.get(self.declare);
                    const variableDeclarationType = variable.type;
                    const expressionInitializationType = result.get(self.expression).expressionType;
                    if (!typeIdentical(variableDeclarationType, expressionInitializationType, result)) {
                        throw `variable '${variable.name.text}' declared at ${variable.name.location} is declared with type ${prettyType(variableDeclarationType, result)}, but the expression used to initialize it (${prettyExpression(self.expression, result)}) has type ${prettyType(expressionInitializationType, result)}.`;
                    }
                    return true;
                },
            },
            StatementAssign: {
                checked: (self, result) => {
                    const reference = result.get(self.reference);
                    const referenceType = reference.referenceType;
                    const assignType = result.get(self.expression).expressionType;
                    if (!typeIdentical(referenceType, assignType, result)) {
                        throw `reference at ${reference.at.location} is declared with type ${prettyType(referenceType, result)}, but the expression used to initialize it (${prettyExpression(self.expression, result)}) has type ${prettyType(assignType, result)}.`;
                    }
                    return true;
                },
            },
            StatementBlock: {
                checked: () => true,
            },
            StatementReturn: {
                checked: (self, result) => {
                    // verify that the function we are in (if any, in case other constructs are created) has the desired return type.
                    let returningFrom: null | Ref<"DeclareFunction"> = null;
                    for (let scope: null|Ref<"Scope"> = self.scope; scope; scope = result.get(scope).parent) {
                        const returnsScope = result.get(scope).returnsFrom;
                        if (returnsScope) {
                            returningFrom = returnsScope;
                            break;
                        }
                    }
                    if (!returningFrom) {
                        throw `unable to return at ${self.at.location} because the return statement is not inside of a function`;
                    }
                    const returnType = result.get(returningFrom).returns;

                    if (returnType) {
                        // must be non-void return
                        if (!self.expression) {
                            throw `unable to return unit at ${self.at.location} because the containing function '${result.get(returningFrom).name.text}' at ${result.get(returningFrom).name.location} must return ${prettyType(returnType, result)}`;
                        }
                        const actualReturn = result.get(self.expression).expressionType;
                        if (!typeIdentical(returnType, actualReturn, result)) {
                            throw `unable to return ${prettyExpression(self.expression, result)} of type ${prettyType(result.get(self.expression).expressionType, result)} at ${self.at.location} because the containing function '${result.get(returningFrom).name.text}' at ${result.get(returningFrom).name.location} must return ${prettyType(returnType, result)}`;
                        }
                        return true;
                    } else {
                        // only void return
                        // TODO: allow unit-typed expression also
                        if (self.expression) {
                            throw `unable to return ${prettyExpression(self.expression, result)} of type ${prettyType(result.get(self.expression).expressionType, result)} at ${self.at.location} because the containing function '${result.get(returningFrom).name.text}' at ${result.get(returningFrom).name.location} returns unit`;
                        }
                        return true;
                    }
                },
            },
            StatementBreak: {
                checked: (self, result) => {
                    let breakingFrom: null | StatementRef = null;
                    for (let scope: null|Ref<"Scope"> = self.scope; scope; scope = result.get(scope).parent) {
                        const breakScope = result.get(scope).breaksFrom;
                        if (breakScope) {
                            breakingFrom = breakScope;
                            break;
                        }
                    }
                    if (!breakingFrom) {
                        throw `unable to break at ${self.at.location} because the break statement is not inside a loop`;
                    }
                    return true;
                },
            },
            StatementContinue: {
                checked: (self, result) => {
                    let breakingFrom: null | StatementRef = null;
                    for (let scope: null|Ref<"Scope"> = self.scope; scope; scope = result.get(scope).parent) {
                        const breakScope = result.get(scope).breaksFrom;
                        if (breakScope) {
                            breakingFrom = breakScope;
                            break;
                        }
                    }
                    if (!breakingFrom) {
                        throw `unable to continue at ${self.at.location} because the continue statement is not inside a loop`;
                    }
                    return true;
                },
            },
            StatementIf: {
                checked: (self, result) => {
                    const conditionType = result.get(self.condition).expressionType;
                    if (!typeIdentical(conditionType, builtinTypeNames.Bool, result)) {
                        throw `expression ${prettyExpression(self.condition, result)} at ${self.at.location} cannot be used as a condition becaue it has type ${prettyType(conditionType, result)}, which is not Bool`;
                    }
                    return true;
                },
            },
            StatementWhile: {
                checked: (self, result) => {
                    const conditionType = result.get(self.condition).expressionType;
                    if (!typeIdentical(conditionType, builtinTypeNames.Bool, result)) {
                        throw `expression ${prettyExpression(self.condition, result)} at ${self.at.location} cannot be used as a condition becaue it has type ${prettyType(conditionType, result)}, which is not Bool`;
                    }
                    return true;
                },
            },
            StatementMatch: {
                enumType: (self, result) => {
                    const expressionTypeRef = result.get(self.expression).expressionType;
                    if (expressionTypeRef.type != "TypeName") {
                        throw `match can only be used on expressions with named types, but ${prettyExpression(self.expression, result)} at ${self.at.location} has type ${prettyType(expressionTypeRef, result)}`;
                    }
                    const expressionTypeDeclareRef = expressionTypeRef.in(result).typeDeclaration;
                    if (expressionTypeDeclareRef.type != "DeclareEnum") {
                        throw `match can only be used on expressions of known enum type, but ${prettyExpression(self.expression, result)} at ${self.at.location} has type ${prettyType(expressionTypeRef, result)}`;
                    }
                    return expressionTypeDeclareRef;
                },
                checked: (self, result) => {
                    const expressionTypeRef = result.get(self.expression).expressionType;
                    if (expressionTypeRef.type != "TypeName") {
                        throw `match can only be used on expressions with named types, but ${prettyExpression(self.expression, result)} at ${self.at.location} has type ${prettyType(expressionTypeRef, result)}`;
                    }
                    const expressionTypeDeclareRef = expressionTypeRef.in(result).typeDeclaration;
                    if (expressionTypeDeclareRef.type != "DeclareEnum") {
                        throw `match can only be used on expressions of known enum type, but ${prettyExpression(self.expression, result)} at ${self.at.location} has type ${prettyType(expressionTypeRef, result)}`;
                    }
                    const enumDetails = expressionTypeDeclareRef.in(result);
                    const substitute: Map<Ref<"DeclareGeneric">, TypeRef> = new Map();
                    for (let i = 0; i < enumDetails.generics.length; i++) {
                        let generic = enumDetails.generics[i];
                        let provided = result.get(expressionTypeRef).parameters[i];
                        substitute.set(generic, provided);
                    }
                    // here, we confirm that the types of the corresponding fields are plausible.
                    for (let branch of self.branches) {
                        let found: TypeRef | null | "no" = "no";
                        for (let variant of enumDetails.variants) {
                            if (branch.variant.text == variant.name.text) {
                                found = variant.type;
                            }
                        }
                        if (found === "no") {
                            throw `match case on expression ${prettyExpression(self.expression, result)} of type ${prettyType(expressionTypeRef, result)} refers to variant name '${branch.variant.text}' at ${branch.variant.location} but no such variant exists on the enum type declared at ${enumDetails.name.location}`;
                        }
                        if (found) {
                            const expectedType = typeSubstitute(found, result, substitute);
                            if (branch.bind && !typeIdentical(expectedType, branch.bind.in(result).type, result)) {
                                throw `match branch on expression ${prettyExpression(self.expression, result)} of type ${prettyType(expressionTypeRef, result)} at ${self.at.location} for variant '${branch.variant.text}' at ${branch.variant.location} should have type ${prettyType(expectedType, result)} for its variable binder but it has type ${prettyType(branch.bind.in(result).type, result)}`;
                            }
                        } else {
                            if (branch.bind) {
                                throw `match branch on expression ${prettyExpression(self.expression, result)} of type ${prettyType(expressionTypeRef, result)} at ${self.at.location} for variant '${branch.variant.text}' at ${branch.variant.location} cannot bind an argument variable`;
                            }
                        }
                    }
                    return true;
                },
            },
            StatementDiscard: {
                checked: () => {
                    return true;
                },
            },
        });
        type Status = {status: "absent"} | {status: "present"} | {status: "borrowed"} | {status: "partial", removed: string[], of: number};
        
        function isLinearType(tr: TypeRef, g: typeof graphFlow): boolean {
            const t = g.get(tr);
            if (t.type == "name") {
                const dr = t.typeDeclaration;
                const d = g.get(dr);
                if (d.declare == "generic") {
                    return d.linear;
                }
                if (d.declare == "builtin-type") {
                    return d.linear;
                }
                return true;
            } else if (t.type == "function") {
                return false; // I guess
            } else if (t.type == "borrow") {
                return false;
            } else if (t.type == "self") {
                return true;
            } else {
                const impossible: never = t;
                return impossible;
            }
        }

        type VariableState = Map<Ref<"DeclareVar">, Status>;

        function consistentCollection(vs: VariableState[]): VariableState {
            if (vs.length == 0) {
                throw "consistent collection is empty";
            }
            for (let bq of vs) {
                for (let [k, v] of bq) {
                    if (!isLinearType(graphFlow.get(k).type, graphFlow)) {
                        continue;
                    }
                    if ((vs[0].get(k) || "absent") != v) {
                        throw "inconsistency in consistent collection";
                    }
                }
                for (let [k, v] of vs[0]) {
                    if (!isLinearType(graphFlow.get(k).type, graphFlow)) {
                        continue;
                    }
                    if ((bq.get(k) || "absent") != v) {
                        throw "inconsistency in consistent collection";
                    }
                }
            }
            return vs[0];
        }
        function unborrowAll(vs: VariableState): VariableState {
            const c = new Map(vs);
            for (let [k, v] of c) {
                if (v.status == "borrowed") {
                    c.set(k, {status: "present"});
                }
            }
            return c;
        }

        const graphFlow = graphS.compute<
            {
                [s in StatementRef["type"] | "StatementBlock"]: {
                    reachesEnd: "yes" | "no" | "maybe",
                    canBreak: boolean,
                    borrowing: null | ((s: VariableState) => VariableState),
                    borrowingBreak: null | ((s: VariableState) => VariableState),
                    borrowingCheck: (s: VariableState) => true,
                }
            }
            & {[e in ExpressionRef["type"]]: {borrowing: (s: VariableState) => VariableState}}
        >({
            StatementDo: {
                reachesEnd: () => "yes",
                canBreak: () => false,
                borrowing: (self, result) => {
                    return (b) => {
                        return result.get(self.expression).borrowing(b);
                    };
                },
                borrowingBreak: () => null,
                borrowingCheck: () => () => true,
            },
            StatementVar: {
                reachesEnd: () => "yes",
                canBreak: () => false,
                borrowing: (self, result) => {
                    return (b: VariableState): VariableState => {
                        b = result.get(self.expression).borrowing(b);
                        if (b.has(self.declare)) {
                            if (b.get(self.declare)!.status != "absent" && isLinearType(result.get(self.declare).type, graphFlow)) {
                                throw `failed to drop variable '${self.declare.in(result).name.text}' at ${self.at.location} before reaching itself`;
                            }
                        }
                        const c = new Map(b);
                        c.set(self.declare, {status: "present"});
                        return c;
                    }
                },
                borrowingBreak: () => null,
                borrowingCheck: () => () => true,
            },
            StatementAssign: {
                reachesEnd: () => "yes",
                canBreak: () => false,
                borrowing: (self, result) => {
                    return (b) => {
                        b = result.get(self.expression).borrowing(b);
                        if (self.reference.type == "ReferenceVar") {
                            if (b.has(self.reference.in(result).referenceTo)) {
                                if (b.get(self.reference.in(result).referenceTo)!.status != "absent") {
                                    throw `cannot assign variable ??? at ${self.at.location} because it's not absent`;
                                }
                            }
                            const r = new Map(b);
                            r.set(self.reference.in(result).referenceTo, {status: "present"});
                            return r;
                        } else {
                            const replacingType = self.reference.in(result).referenceType;
                            if (replacingType.type != "TypeName") {
                                throw `unable to replace linear field at ${self.at.location}`;
                            }
                            const replacingName = replacingType.in(result).typeDeclaration;
                            if (replacingName.type != "DeclareBuiltinType") {
                                throw `unable to replace linear-type field at ${self.at.location}`;
                            }
                            if (replacingName.in(result).linear) {
                                throw `unable to replace linear-type field at ${self.at.location}`;
                            }
                            // find the modified variable
                            const modifiedOriginal = (x: ReferenceRef): Ref<"DeclareVar"> => {
                                if (x.type == "ReferenceVar") {
                                    return x.in(result).referenceTo;
                                } else {
                                    return modifiedOriginal(x.in(result).object);
                                }
                            };
                            const original = modifiedOriginal(self.reference);
                            if ((b.get(original) || {status: "absent"}).status == "absent") {
                                throw `cannot assign to absent variable at ${self.at.location}`;
                            }
                            const c = new Map(b);
                            return c;
                        }
                    };
                },
                borrowingBreak: () => null,
                borrowingCheck: () => () => true,
            },
            StatementReturn: {
                reachesEnd: () => "no",
                canBreak: () => false,
                borrowing: () => null,
                borrowingBreak: () => null,
                borrowingCheck: (self, result) => {
                    return (b) => {
                        if (self.expression) {
                            b = result.get(self.expression).borrowing(b);
                        }
                        for (let [k, v] of b) {
                            if (v.status != "absent" && isLinearType(result.get(k).type, graphFlow)) {
                                throw `variable '${k.in(result).name.text}' declared at ${k.in(result).name.location} has not been cleaned up by the return at ${self.at.location}`;
                            }
                        }
                        return true;
                    };
                },
            },
            StatementBreak: {
                reachesEnd: () => "no",
                canBreak: () => true,
                borrowing: () => null,
                borrowingBreak: () => (b) => b,
                borrowingCheck: () => () => true,
            },
            StatementContinue: {
                reachesEnd: () => "no",
                canBreak: () => false,
                borrowing: (x) => {
                    throw "no continue;";
                },
                borrowingBreak: () => null,
                borrowingCheck: () => () => true,
            },
            StatementBlock: {
                reachesEnd: (self, result) => {
                    let best: "yes" | "no" | "maybe" = "yes";
                    for (let s of self.body) {
                        if (best == "no") {
                            throw `unreachable statement at ${result.get(s).at.location}`;
                        }
                        const passes = result.get(s).reachesEnd;
                        if (passes == "no") {
                            best = "no";
                        }
                        if (passes == "maybe" && best == "yes") {
                            best = "maybe";
                        }
                    }
                    return best;
                },
                canBreak: (self, result) => {
                    for (let s of self.body) {
                        if (result.get(s).canBreak) {
                            return true;
                        }
                    }
                    return false;
                },
                borrowing: (self, result) => {
                    for (let sr of self.body) {
                        const s = result.get(sr);
                        if (!s.borrowing) {
                            // doesn't reach the end in conventional manner
                            return null;
                        }
                    }
                    return (b) => {
                        self.borrowingCheck(b);
                        // insert resets in-between
                        for (let sr of self.body) {
                            const s = result.get(sr);
                            s.borrowingCheck(b);
                            b = s.borrowing!(b);
                            b = unborrowAll(b);
                        }
                        return b;
                    };
                },
                borrowingBreak: (self, result) => {
                    let atLeastOne = false;
                    for (let sr of self.body) {
                        const s = result.get(sr);
                        if (s.borrowingBreak) {
                            atLeastOne = true;
                        }
                        if (!s.borrowing) {
                            break;
                        }
                    }
                    if (!atLeastOne) {
                        return null;
                    }
                    return (b) => {
                        self.borrowingCheck(b);
                        let one: null | VariableState = null;
                        for (let sr of self.body) {
                            const s = result.get(sr);
                            if (s.borrowingBreak) {
                                let wb = s.borrowingBreak(b);
                                if (!one) {
                                    one = wb;
                                } else {
                                    // verify equality
                                    for (let [k, v] of one) {
                                        if (!wb.has(k) && v.status != "absent") {
                                            throw "missing variable in subsequent break";
                                        }
                                        if (wb.has(k) && v.status != wb.get(k)!.status) {
                                            throw "variable has inconsistent state across breaks";
                                        }
                                    }
                                }
                            }
                            if (!s.borrowing) {
                                break;
                            }
                            b = s.borrowing(b);
                            b = unborrowAll(b);
                        }
                        return one!;
                    };
                },
                borrowingCheck: (self, result) => {
                    return (b) => {
                        for (let sr of self.body) {
                            const s = result.get(sr);
                            s.borrowingCheck(b);
                            if (!s.borrowing) {
                                break;
                            }
                            b = s.borrowing(b);
                            b = unborrowAll(b);
                        }
                        return true;
                    };
                },
            },
            StatementIf: {
                reachesEnd: (self, result) => {
                    const passThen = result.get(self.then).reachesEnd;
                    const passOtherwise = result.get(self.otherwise).reachesEnd;
                    if (passThen == "yes" && passOtherwise == "yes") {
                        return "yes";
                    }
                    if (passThen == "no" && passOtherwise == "no") {
                        return "no";
                    }
                    return "maybe";
                },
                canBreak: (self, result) => {
                    return result.get(self.then).canBreak || result.get(self.otherwise).canBreak;
                },
                borrowing: (self, result) => {
                    const blockThen = result.get(self.then);
                    const blockElse = result.get(self.otherwise);
                    if (!blockThen.borrowing && !blockElse.borrowing) {
                        return null;
                    }
                    return (b): VariableState => {
                        b = result.get(self.condition).borrowing(b);
                        // read expression
                        b = unborrowAll(b);
                        // two possible bodies; they must be consistent if present
                        
                        if (!blockThen.borrowing) {
                            return blockElse.borrowing!(b);
                        }
                        if (!blockElse.borrowing) {
                            return blockThen.borrowing!(b);
                        }
                        
                        const b1 = blockThen.borrowing(b);
                        const b2 = blockElse.borrowing(b);

                        return consistentCollection([b1, b2]);
                    };
                },
                borrowingBreak: (self, result) => {
                    const blockThen = result.get(self.then);
                    const blockElse = result.get(self.otherwise);
                    if (!blockThen.borrowingBreak && !blockElse.borrowingBreak) {
                        return null;
                    }
                    return (b) => {
                        b = result.get(self.condition).borrowing(b);
                        // read expression
                        b = unborrowAll(b);

                        if (!blockThen.borrowingBreak) {
                            return blockElse.borrowingBreak!(b);
                        }
                        if (!blockElse.borrowingBreak) {
                            return blockThen.borrowingBreak!(b);
                        }
                        // otherwise, obtain both and check
                        const b1 = blockThen.borrowingBreak(b);
                        const b2 = blockElse.borrowingBreak(b);

                        return consistentCollection([b1, b2]);
                    };
                },
                borrowingCheck: (self, result) => {
                    return (b) => {
                        b = result.get(self.condition).borrowing(b);
                        // read expression
                        b = unborrowAll(b);
                        
                        result.get(self.then).borrowingCheck(b);
                        result.get(self.otherwise).borrowingCheck(b);
                        return true;
                    };
                },
            },
            StatementWhile: {
                reachesEnd: () => "maybe",
                canBreak: () => false,
                borrowing: (self, result) => {
                    return (b) => {
                        const body = result.get(self.body);
                        // run the loop 3 times;
                        // this is enough because the interpretation is graded
                        // and variables are independent of one another
                        
                        const possibilities: VariableState[] = [];
                        {
                            // C(false) ; done
                            const pb = result.get(self.condition).borrowing(b);
                            const c = unborrowAll(pb);
                            possibilities.push(c);
                        }
                        if (body.borrowing) {
                            // C(true) body C(false) ; done
                            const pb = result.get(self.condition).borrowing(b);
                            const c = unborrowAll(pb);
                            body.borrowingCheck(c);
                            const q = body.borrowing(c);
                            const pb2 = result.get(self.condition).borrowing(b);
                            const c2 = unborrowAll(pb2);
                            possibilities.push(c2);
                        }
                        if (body.borrowing) {
                            // C(true) body C(true) body C(false) ; done
                            const pb = result.get(self.condition).borrowing(b);
                            const c = unborrowAll(pb);
                            body.borrowingCheck(c);
                            const q = body.borrowing(c);
                            const pb2 = result.get(self.condition).borrowing(q);
                            const c2 = unborrowAll(pb2);
                            body.borrowingCheck(c2);
                            const q2 = body.borrowing(c2);
                            const pb3 = result.get(self.condition).borrowing(q2);
                            const c3 = unborrowAll(pb3);
                            possibilities.push(c3);
                        }
                        if (body.borrowingBreak) {
                            // C(true) body break ; done
                            // C(true) body C(false) ; done
                            const pb = result.get(self.condition).borrowing(b);
                            const c = unborrowAll(pb);
                            body.borrowingCheck(c);
                            const q = body.borrowingBreak(c);
                            possibilities.push(q);
                        }
                        if (body.borrowing && body.borrowingBreak) {
                            // C(true) body C(true) body break ; done
                            const pb = result.get(self.condition).borrowing(b);
                            const c = unborrowAll(pb);
                            body.borrowingCheck(c);
                            const q = body.borrowing(c);
                            const pb2 = result.get(self.condition).borrowing(q);
                            const c2 = unborrowAll(pb2);
                            body.borrowingCheck(c2);
                            possibilities.push(body.borrowingBreak(c2));
                        }
                        // verify that all possibilities are the same.
                        return consistentCollection(possibilities);
                    };
                },
                borrowingBreak: (self, result) => {
                    return null;
                },
                borrowingCheck: (self, result) => {
                    return (b) => {
                        return true;
                    };
                }
            },
            StatementMatch: {
                reachesEnd: (self, result) => {
                    const possibilities = {yes: 0, no: 0, maybe: 0};
                    for (let branch of self.branches) {
                        possibilities[branch.block.in(result).reachesEnd]++;
                    }
                    for (let variant of self.enumType.in(result).variants) {
                        if (!self.branches.some(branch => branch.variant.text == variant.name.text)) {
                            possibilities.yes++;
                        }
                    }
                    if (possibilities.yes == 0 && possibilities.maybe == 0) {
                        return "no";
                    }
                    if (possibilities.no == 0 && possibilities.maybe == 0) {
                        return "yes";
                    }
                    return "maybe";
                },
                canBreak: (self, result) => self.branches.some(branch => branch.block.in(result).canBreak),
                borrowing: (self, result) => {
                    if (self.reachesEnd == "no") {
                        return null;
                    }
                    return (b) => {
                        b = result.get(self.expression).borrowing(b);
                        let c = unborrowAll(b);
                        let possibilities = [];
                        for (let branch of self.branches) {
                            let bound = new Map(c);
                            if (branch.bind) {
                                if ((bound.get(branch.bind) || "absent") != "absent") {
                                    throw "cannot rebind to existing var in match";
                                }
                                bound.set(branch.bind, {status: "present"});
                            }
                            const variantBlock = result.get(branch.block);
                            if (variantBlock.borrowing) {
                                possibilities.push(variantBlock.borrowing(bound));
                            }
                        }
                        for (let bq of possibilities) {
                            for (let [k, v] of bq) {
                                if ((possibilities[0].get(k) || "absent") != v) {
                                    throw "inconsistency in match proceed";
                                }
                            }
                            for (let [k, v] of possibilities[0]) {
                                if ((bq.get(k) || "absent") != v) {
                                    throw "inconsistency in match proceed";
                                }
                            }
                        }
                        return possibilities[0];
                    };
                },
                borrowingBreak: (self, result) => {
                    if (!self.canBreak) {
                        return null;
                    }
                    return (b) => {
                        b = result.get(self.expression).borrowing(b);
                        let c = unborrowAll(b);
                        let possibilities = [];
                        for (let branch of self.branches) {
                            let bound = new Map(c);
                            if (branch.bind) {
                                if ((bound.get(branch.bind) || {status: "absent"}).status != "absent") {
                                    throw "cannot rebind to existing var in match";
                                }
                                bound.set(branch.bind, {status: "present"});
                            }
                            const variantBlock = result.get(branch.block);
                            if (variantBlock.borrowingBreak) {
                                possibilities.push(variantBlock.borrowingBreak(bound));
                            }
                        }
                        for (let bq of possibilities) {
                            for (let [k, v] of bq) {
                                if ((possibilities[0].get(k) || "absent") != v) {
                                    throw "inconsistency in match break";
                                }
                            }
                            for (let [k, v] of possibilities[0]) {
                                if ((bq.get(k) || "absent") != v) {
                                    throw "inconsistency in match break";
                                }
                            }
                        }
                        return possibilities[0];
                    };
                },
                borrowingCheck: (self, result) => {
                    return () => true;
                }
            },
            StatementDiscard: {
                reachesEnd: (self, result) => {
                    return "yes";
                },
                canBreak: (self, result) => false,
                borrowing: (self, result) => {
                    const decl = self.decl.in(result);
                    const declType = decl.type;
                    if (declType.type != "TypeName") {
                        throw `cannot discard non-struct type value at ${self.at.location}`;
                    }
                    const declTypeName = declType.in(result).typeDeclaration;
                    if (declTypeName.type != "DeclareStruct") {
                        throw `cannot discard non-struct type value at ${self.at.location}`;
                    }
                    return (b) => {
                        if (!b.get(self.decl)){
                            throw "ICE 3050";
                        }
                        const s = b.get(self.decl)!;
                        if (s.status != "partial") {
                            throw `cannot discard non-partial struct type at ${self.at.location}`;
                        }
                        if (s.removed.length != s.of) {
                            throw `cannot discard incompletely dismantled type at ${self.at.location}; ${s.of - s.removed.length} linear fields may still remain`;
                        }
                        const c = new Map(b);
                        c.set(self.decl, {status: "absent"});
                        return c;
                    };
                },
                borrowingBreak: (self, result) => {
                    return null;
                },
                borrowingCheck: (self, result) => {
                    return () => true;
                }
            },
            // expression histories
            ExpressionInteger: {
                borrowing: () => {
                    return (b) => b;
                },
            },
            ExpressionString: {
                borrowing: () => {
                    return (b) => b;
                },
            },
            ExpressionBoolean: {
                borrowing: () => {
                    return (b) => b;
                },
            },
            ExpressionVariable: {
                borrowing: (self, result) => {
                    const decl = self.variableDeclaration;
                    if (decl.type != "DeclareVar") {
                        return (b) => b;
                    }
                    const varType = decl.in(result).type;
                    if (varType.type == "TypeName") {
                        const nameType = varType.in(result).typeDeclaration;
                        if (nameType.type == "DeclareBuiltinType" && !nameType.in(result).linear) {
                            return (b) => b;
                        }
                    }
                    return (b) => {
                        if (!isLinearType(decl.in(result).type, graphFlow)) {
                            return b; // nothing to track
                        }
                        if (b.has(decl)) {
                            if (b.get(decl)!.status == "absent") {
                                throw `cannot consume variable '${self.variable.text}' at ${self.variable.location} because it was already consumed`;
                            }
                            if (b.get(decl)!.status == "borrowed") {
                                throw `cannot consume variable '${self.variable.text}' at ${self.variable.location} because it's currently borrowed`;
                            }
                            const copy = new Map(b);
                            copy.set(decl, {status: "absent"});
                            return copy;
                        }
                        throw `cannot consume variable '${self.variable.text}' at ${self.variable.location} because it's not available`;
                    };
                }
            },
            ExpressionDot: {
                borrowing: (self, result) => {
                    const object = result.get(self.object);
                    if (object.type != "variable") {
                        throw `cannot get field of non-variable`;
                    }
                    const decl = object.variableDeclaration;
                    if (decl.type != "DeclareVar") {
                        throw "ICE 3051";
                    }

                    if (self.objectType.byReference) {
                        throw "TODO: dot by reference";
                    }

                    const fieldType = self.structDeclaration.struct.in(result).fields.filter(f => f.name.text == self.field.text)[0].type;
                    
                    return (b: VariableState): VariableState => {
                        if (!b.has(decl)) {
                            throw `unknown variable '${object.variable.text}' at ${object.at.location}`;
                        }
                        const status = b.get(decl)!;
                        if (isLinearType(fieldType, result)) {
                            if (status.status == "borrowed") {
                                throw `cannot access field '${self.field.text}' on an object that is currently borrowed`;
                            } else if (status.status == "absent") {
                                throw `cannot access field '${self.field.text}' on an object that was already consumed`;
                            } else if (status.status == "partial") {
                                if (status.removed.indexOf(self.field.text) >= 0) {
                                    throw `cannot access field '${self.field.text}' on an object which has already removed it`;
                                } else {
                                    const c = new Map(b);
                                    c.set(decl, {status: "partial", removed: status.removed.concat([self.field.text]), of: status.of});
                                    return c;
                                }
                            } else if (status.status == "present") {
                                const c = new Map(b);
                                c.set(decl, {status: "partial", removed: [self.field.text], of: self.structDeclaration.struct.in(result).fields.filter(f => isLinearType(f.type, result)).length});
                                return c;
                            } else {
                                const impossible: never = status;
                                return impossible;
                            }
                        } else {
                            if (status.status != "present" && status.status != "borrowed") {
                                throw `cannot access field '${self.field.text}' on an object that may have already been consumed`;
                            }
                            return b;
                        }
                    };
                    // return result.get(self.object).borrowing;
                },
            },
            ExpressionCall: {
                borrowing: (self, result) => {
                    return (b) => {
                        b = result.get(self.func).borrowing(b);
                        for (let arg of self.arguments) {
                            b = result.get(arg).borrowing(b);
                        }
                        return b;
                    };
                },
            },
            ExpressionOperator: {
                borrowing: (self, result) => {
                    return (b) => {
                        b = result.get(self.func).borrowing(b);
                        const args = self.left ? [self.left, self.right] : [self.right];
                        for (let arg of args) {
                            b = result.get(arg).borrowing(b);
                        }
                        return b;
                    };
                },
            },
            ExpressionObject: {
                borrowing: (self, result) => {
                    return (b) => {
                        if (self.contents.type == "fields") {
                            for (let field of self.contents.fields) {
                                b = result.get(field.value).borrowing(b);
                            }
                            return b;
                        } else if (self.contents.type == "single") {
                            return result.get(self.contents.value).borrowing(b);
                        } else if (self.contents.type == "empty") {
                            return b;
                        } else {
                            const impossible: never = self.contents;
                            return impossible;
                        }
                    };
                }
            },
            ExpressionArray: {
                borrowing: (self, result) => {
                    return (b) => {
                        for (let field of self.fields) {
                            b = result.get(field).borrowing(b);
                        }
                        return b;
                    };
                },
            },
            ExpressionBorrow: {
                borrowing: (self, result) => {
                    if (self.reference.type != "ReferenceVar") {
                        throw "ICE 2689";
                    }
                    const v = self.reference.in(result).referenceTo;
                    return (b) => {
                        if (b.has(v)) {
                            if (b.get(v)!.status == "absent") {
                                throw `cannot borrow variable '${v.in(result).name.text}' at ${self.at.location} because it was already consumed`;
                            }
                            const r = new Map(b);
                            r.set(v, {status: "borrowed"});
                            return r;
                        }
                        throw `cannot borrow variable '${v.in(result).name.text}' at ${self.at.location} because it has no value`;
                    };
                },
            },
            ExpressionForeign: {
                // TODO history; foreign expressions may want to explain how they effect things.
                borrowing: (self, result) => {
                    return (b) => {
                        const res = new Map(b);
                        let matches = self.at.text.match(/@:\w+:\[\w+\]/g) || [];
                        for (let match of matches) {
                            let [_, kind, name] = match.match(/@:(\w+):\[(\w+)\]/)!;
                            const decl = lookupScope(result, self.scope, name);
                            if (!decl) {
                                throw `no such name '${name}' at ${self.at.location} in foreign expression`;
                            }
                            if (kind == "none") {
                                continue;
                            }
                            if (decl.type != "DeclareVar") {
                                throw `usage cannot refer to non-variable`;
                            }
                            let after: {[x: string]: Status} = {
                                "use": {status: "absent"},
                                "put": {status: "present"},
                                "ref": {status: "borrowed"},
                            };
                            if (kind in after) {
                                res.set(decl, after[kind]);
                            } else {
                                throw `unknown usage spec '${kind}' in foreign expression at ${self.at.location} for variable '${name}'`;
                            }
                        }
                        return res;
                    };
                },
            },
        });

        // Check for functions missing returns.
        graphFlow.each("DeclareFunction", (func) => {
            if (func.returns && graphFlow.get(func.body).reachesEnd != "no") {
                throw `control flow may reach the end of function '${func.name.text}' declared at ${func.name.location}`;
            }
            const initialB: VariableState = new Map();
            for (let arg of func.arguments) {
                initialB.set(arg, {status: "present"});
            }
            const body = graphFlow.get(func.body);
            body.borrowingCheck(initialB);
            if (body.borrowing) {
                const result = body.borrowing(initialB);
                for (let [k, v] of result) {
                    const decl = k.in(graphFlow);
                    if (!isLinearType(decl.type, graphFlow)) {
                        continue;
                    }
                    if (v.status != "absent") {
                        throw `at the end of function '${func.name.text}' the variable '${k.in(graphFlow).name.text}' was not consumed before the function returned`;
                    }
                }
            }
        });

        const indentString = (s: string) => s.split("\n").map(l => "\t" + l).join("\n");



        const graphC = graphFlow.compute<
            {[e in ExpressionRef["type"]]: {compute: C.Computation}}
            & {[s in Diff< StatementRef["type"], "StatementBlock">] : {execute: C.Statement}}
            & {StatementBlock: {execute: C.Block}}
            & {DeclareVar: {register: C.Register}}
            & {DeclareFunction: {register: C.Register, declaration: {func: C.Func, value: C.Global}}}
            & {DeclareBuiltinVar: {register: C.Register}}
            & {DeclareMethod: {register: C.Register}}
            & {DeclareInterface: {interfaceRecord: C.Struct, declarations: {methods: {func: C.Func, value: C.Global}[]} }}
            & {DeclareInstance: {declarations: {record: C.Struct, create: C.Func, implement: C.Func[]}}}
            & {DeclareStruct: {declaration: C.Struct}}
            & {DeclareEnum: {declaration: C.Struct, variantTags: {[n: string]: number}}}
            & {DeclareGeneric: {instanceObjects: C.Register[]}}
        >({
            ExpressionInteger: {
                compute: (self): C.Load => new C.Load("(void*)(intptr_t)" + self.value.text + ""),
            },
            ExpressionString: {
                compute: (self): C.Load => new C.Load(self.value.text),
            },
            ExpressionBoolean: {
                compute: (self): C.Load => new C.Load(self.value.text == "true" ? "(void*)(intptr_t)1" : "(void*)(intptr_t)0"),
            },
            ExpressionVariable: {
                compute: (self, result): C.Copy => {
                    return new C.Copy(result.get(self.variableDeclaration).register);
                },
            },
            ExpressionDot: {
                compute: (self, result): C.FieldRead => new C.FieldRead(result.get(self.object).compute, self.structDeclaration.struct.in(result).name.text, self.field.text),
            },
            ExpressionCall: {
                // TODO: handle instance parameters
                compute: (self, result): C.CallDynamic => {
                    const computeInstanceObject = (i: Instance): C.Computation => {
                        if (i.instanceFor == "generic") {
                            // read from the one passed as an argument
                            return new C.Copy(i.generic.in(result).instanceObjects[i.constraintIndex]);
                        } else {
                            // construct from the instance's create method.
                            const inst = i.instance.in(result);
                            const parameters = i.requirements.map(r => computeInstanceObject(r));
                            return new C.CallStatic(inst.declarations.create.name, parameters);
                        }
                    };
                    const implicitParameters = self.passInstances.map(computeInstanceObject);
                    const formalParameters = self.arguments.map(arg => result.get(arg).compute);
                    // TODO: compute the function only ONCE
                    return new C.CallDynamic(
                        result.get(self.func).compute,
                        "bismuth_function",
                        "func",
                        [result.get(self.func).compute].concat(implicitParameters, formalParameters),
                    );
                },
            },
            ExpressionOperator: {
                compute: (self, result): C.Computation => {
                    const computeInstanceObject = (i: Instance): C.Computation => {
                        if (i.instanceFor == "generic") {
                            // read from the one passed as an argument
                            return new C.Copy(i.generic.in(result).instanceObjects[i.constraintIndex]);
                        } else {
                            // construct from the instance's create method.
                            const inst = i.instance.in(result);
                            const parameters = i.requirements.map(r => computeInstanceObject(r));
                            return new C.CallStatic(inst.declarations.create.name, parameters);
                        }
                    };
                    const implicitParameters = self.passInstances.map(computeInstanceObject);
                    const formalParameters = (self.left ? [self.left, self.right] : [self.right]).map(e => result.get(e).compute);
                    return new C.CallDynamic(
                        result.get(self.func).compute,
                        "bismuth_function",
                        "func",
                        implicitParameters.concat(formalParameters),
                    );
                },
            },
            ExpressionObject: {
                compute: (self, result): C.Computation => {
                    if (self.contents.type == "fields") {
                        let fields: {[x: string]: C.Computation} = {};
                        for (let field of self.contents.fields) {
                            fields[field.name.text] = result.get(field.value).compute;
                        }
                        return new C.Allocate(
                            self.name.text, // TODO: namespace properly
                            fields,
                        );
                    } else if (self.contents.type == "empty") {
                        const asVariant = self.declaration;
                        if (asVariant.type != "DeclareVariant") {
                            throw "ICE 2336";
                        }
                        return new C.Allocate(
                            asVariant.in(result).owner.in(result).declaration.name,
                            {
                                tag: new C.Load("(void*)(intptr_t)" + asVariant.in(result).owner.in(result).variantTags[self.name.text]),
                                value: new C.Load("0"),
                            },
                        );
                    } else if (self.contents.type == "single") {
                        const asVariant = self.declaration;
                        if (asVariant.type != "DeclareVariant") {
                            throw "ICE 2348";
                        }
                        return new C.Allocate(
                            asVariant.in(result).owner.in(result).declaration.name,
                            {
                                tag: new C.Load("(void*)(intptr_t)" + asVariant.in(result).owner.in(result).variantTags[self.name.text]),
                                value: result.get(self.contents.value).compute,
                            },
                        );
                    } else {
                        const impossible: never = self.contents;
                        return impossible;
                    }
                },
            },
            ExpressionArray: {
                compute: (self, result): C.Computation => {
                    // produce a snoc-list
                    // TODO: make this more efficient
                    let array = new C.CallStatic("makeArray", []);
                    for (let value of self.fields) {
                        array = new C.CallStatic("snoc", [array, result.get(value).compute]);
                    }
                    return array;
                },
            },
            ExpressionBorrow: {
                compute: (self, result): C.Computation => {
                    if (self.reference.type != "ReferenceVar") {
                        throw `unable to perform borrow at ${self.at.location}; only variable names can be borrowed directly`;
                    }
                    return new C.AddressOf(self.reference.in(result).referenceTo.in(result).register);
                },
            },
            ExpressionForeign: {
                compute: (self, result): C.Computation => {
                    let text = self.at.text.split("#")[1];
                    while (true) {
                        let m = text.match(/@(:\w+:)\[(\w+)\]/);
                        if (!m) {
                            break;
                        }
                        let v = m[2];
                        let lookup = lookupScope(result, self.scope, v);
                        if (!lookup) {
                            throw `at foreign expression '${self.at.text}' at ${self.at.location} the variable '${v}' is not in scope`;
                        }
                        if (lookup.type != "DeclareVar") {
                            throw `at foreign expression '${self.at.text}' at ${self.at.location} the variable '${v}' is not a variable`;
                        }
                        text = text.replace(new RegExp("@" + m[1] + "\\[" + v + "\\]", "g"), lookup.in(result).register.name);
                    }
                    return new C.Foreign(text);
                },
            },
            StatementDo: {
                execute: (self, result): C.Statement => new C.Execute(result.get(self.expression).compute),
            },
            StatementAssign: {
                execute: (self, result): C.Statement => {
                    const readReference = (r: ReferenceRef): C.Computation => {
                        if (r.type == "ReferenceVar") {
                            return new C.Copy(r.in(result).referenceTo.in(result).register);
                        } else {
                            return new C.FieldRead(readReference(r.in(result).object), r.in(result).referenceStruct.in(result).name.text, r.in(result).field.text);
                        }
                    };

                    const buildAssign = (r: ReferenceRef, t: C.Computation): C.Statement => {
                        if (r.type == "ReferenceVar") {
                            return new C.Assignment(r.in(result).referenceTo.in(result).register, t);
                        } else if (r.type == "ReferenceDot") {
                            const initialRead = readReference(r.in(result).object);
                            const allFields = r.in(result).referenceStruct.in(result).fields;
                            const copiedFields: {[p: string]: C.Computation} = {};
                            for (let f of allFields) {
                                if (f.name.text == r.in(result).field.text) {
                                    copiedFields[f.name.text] = t;
                                } else {
                                    copiedFields[f.name.text] = new C.FieldRead(initialRead, r.in(result).referenceStruct.in(result).name.text, f.name.text);
                                }
                            }
                            return buildAssign(r.in(result).object, new C.Allocate(r.in(result).referenceStruct.in(result).name.text, copiedFields));
                        } else {
                            const impossible: never = r;
                            return impossible;
                        }
                    };

                    return buildAssign(self.reference, result.get(self.expression).compute);
                },
            },
            StatementVar: {
                execute: (self, result): C.Local => new C.Local(result.get(self.declare).register, result.get(self.expression).compute),
            },
            StatementContinue: {
                execute: (): C.Continue => new C.Continue(),
            },
            StatementBreak: {
                execute: (): C.Break => new C.Break(),
            },
            StatementReturn: {
                execute: (self, result): C.Statement => self.expression ? new C.Return(result.get(self.expression).compute) : new C.Return(null),
            },
            StatementIf: {
                execute: (self, result) => new C.ConditionBlock(
                    result.get(self.condition).compute,
                    self.then.in(result).execute,
                    self.otherwise.in(result).execute,
                ),
            },
            StatementWhile: {
                execute: (self, result) => new C.Loop(
                    new C.Block([
                        new C.ConditionBlock(
                            result.get(self.condition).compute,
                            new C.Block([new C.Break()]),
                            new C.Block([]),
                        ),
                        new C.DoBlock(self.body.in(result).execute),
                    ]),
                ),
            },
            StatementMatch: {
                execute: (self, result) => {
                    const expression = result.get(self.expression).compute;
                    const matchOn = new C.Register("match");
                    const tag = new C.Register("tag");
                    const block: C.Statement[] = [];
                    block.push(new C.Local(matchOn, expression));
                    block.push(new C.Local(tag, new C.FieldRead(new C.Copy(matchOn), self.enumType.in(result).declaration.name, "tag")));
                    for (let branch of self.branches) {
                        block.push(new C.ConditionBlock(
                            new C.Operator(new C.Copy(tag), "==", new C.Load("(void*)(intptr_t)" + self.enumType.in(result).variantTags[branch.variant.text])),
                            new C.Block([
                                branch.bind ? new C.Local(branch.bind.in(result).register, new C.FieldRead(new C.Copy(matchOn), self.enumType.in(result).declaration.name, "value")) : new C.Empty(),
                                new C.DoBlock(branch.block.in(result).execute),
                            ]),
                            new C.Block([]),
                        ));
                    }
                    return new C.DoBlock(new C.Block(block));
                },
            },
            StatementDiscard: {
                execute: (self, result): C.Execute => new C.Execute(new C.Foreign(`free(${self.decl.in(result).register.name});`)),
            },
            StatementBlock: {
                execute: (self, result): C.Block => new C.Block(self.body.map(s => result.get(s).execute)),
            },
            DeclareVar: {
                register: (self) => new C.Register(self.name.text),
            },
            DeclareFunction: {
                register: (self) => new C.Register(self.name.text),
                declaration: (self, result) => {
                    const name = self.scale.scale == "global" ? "user_func_" + self.name.text : "local_" + self.name.text + "_" + self.scale.unique;
                    const parameters: C.Register[] = [new C.Register("ignore_self")];
                    for (const gr of self.generics) {
                        const g = gr.in(result);
                        for (const c of g.instanceObjects) {
                            parameters.push(c);
                        }
                    }
                    for (const ar of self.arguments) {
                        const a = ar.in(result).register;
                        parameters.push(a);
                    }
                    const code = self.body.in(result).execute;
                    return {
                        func: new C.Func(name, parameters, code),
                        value: new C.Global(self.register, new C.Allocate("bismuth_function", {func: new C.Load(name)}), "struct bismuth_function*"),
                    };
                },
            },
            DeclareBuiltinVar: {
                register: (self) => new C.Register(self.name.text),
            },
            DeclareMethod: {
                register: (self) => new C.Register(self.name.text),
            },
            DeclareStruct: {
                declaration: (self, result) => {
                    return new C.Struct(self.name.text, self.fields.map(f => f.name.text));
                },
            },
            DeclareEnum: {
                declaration: (self) => {
                    return new C.Struct(self.name.text, ["tag", "value"]);
                },
                variantTags: (self) => {
                    const tags: {[n: string]: number} = {};
                    let i = 0;
                    for (let c of self.variants) {
                        tags[c.name.text] = i++;
                    }
                    return tags;
                }
            },
            DeclareInterface: {
                interfaceRecord: (self, result) => new C.Struct(`iface_${self.name.text}`, self.methods.map(m => ({custom: `void* (*${m.in(result).name.text})()`}))),
                declarations: (self, result) => ({
                    methods: self.methods.map(m => {
                        let v = m.in(result);
                        const parameters: C.Register[] = [new C.Register("literallySelf"), new C.Register("selfConstraint")];
                        for (let gr of v.type.in(result).generics) {
                            let g = gr.in(result);
                            for (let c of g.instanceObjects) {
                                parameters.push(c);
                            }
                        }
                        for (let p of v.type.in(result).arguments) {
                            parameters.push(new C.Register("forward_arg"));
                        }
                        const func = new C.Func(
                            `iface_${self.name.text}_method_${v.name.text}_extract`,
                            parameters,
                            new C.Block([
                                new C.Return(
                                    new C.CallDynamic(
                                        new C.Copy(parameters[1]),
                                        self.interfaceRecord.name,
                                        v.name.text, // the method to extract
                                        parameters.slice(1).map(e => new C.Copy(e)),
                                    ),
                                ),
                            ]),
                        );
                        return {
                            func: func,
                            value: new C.Global(
                                v.register,
                                new C.Allocate("bismuth_function", {func: new C.Copy(C.Register.foreignName(func.name))}),
                                "struct bismuth_function*",
                            ),
                        };
                    }),
                }),
            },
            DeclareInstance: {
                declarations: (self, result) => {
                    const instanceName = self.type.in(result).name.text;
                    const componentInstances: {name: string, prefix: boolean, register: C.Register}[] = [];
                    const createFields: {[f: string]: C.Computation} = {};
                    for (const method of self.implements.in(result).methods) {
                        const additional = {prefix: true, name: `gives_${method.in(result).name.text}`, register: new C.Register()}
                        componentInstances.push(additional);
                    }
                    for (const gr of self.generics) {
                        const g = gr.in(result);
                        let iter = 0;
                        for (const i of g.instanceObjects) {
                            const additional = {prefix: false, name: `needs_${g.name.text}`, register: i}
                            componentInstances.push(additional);
                            createFields[additional.name] = new C.Copy(i);
                            ++iter;
                        }
                    }
                    const record = new C.Struct(
                        `iface_${self.name.text}_inst_${instanceName}_record`,
                        componentInstances.map(f => f.name),
                    );
                    const implement = self.methods.map(mr => {
                        const m = mr.in(result);
                        const bundle = new C.Register("self_bundle");
                        const preamble: C.Statement[] = [];
                        for (const field of componentInstances) {
                            // declare and load expected instances from the self-bundle.
                            if (!field.prefix) {
                                preamble.push(new C.Local(field.register, new C.FieldRead(new C.Copy(bundle), record.name, field.name)));
                            }
                        }
                        const f = new C.Func(
                            `iface_${self.name.text}_inst_${instanceName}_method_${m.name.text}_impl`,
                            [bundle].concat(m.arguments.map(ar => ar.in(result).register)),
                            new C.Block(preamble.concat([
                                new C.DoBlock(m.body.in(result).execute),
                            ])),
                        );
                        createFields["gives_" + m.name.text] = new C.Load(f.name);
                        return f;
                    });
                    const create = new C.Func(
                        `iface_${self.name.text}_inst_${instanceName}_create`,
                        componentInstances.filter(f => !f.prefix).map(f => f.register),
                        new C.Block([
                            new C.Return(
                                new C.Allocate(
                                    record.name,
                                    createFields,
                                )
                            )
                        ]),
                    );
                    return {
                        record: record,
                        create: create,
                        implement: implement,
                    };
                },
            },
            DeclareGeneric: {
                instanceObjects: (self) => self.constraintNames.map(c => new C.Register(`${self.name.text}_inst_${c.text}`)),
            },
        });

        const prologueJS = `
////////////////////////////////////////////////////////
// BEGIN PRELUDE ///////////////////////////////////////
////////////////////////////////////////////////////////

function print(line) {
    console.log(line);
}

function at(array, index) {
    if (index < 0 || index >= array.length) {
        throw "out-of-bounds array access";
    }
    return array[index];
}

function appendArray(array1, array2) {
    return array1.concat(array2);
}

function length(array) {
    return array.length;
}

function less(x, y) {
    return x < y;
}

////////////////////////////////////////////////////////
// BEGIN PROGRAM ///////////////////////////////////////
////////////////////////////////////////////////////////

`;
        const epilogueJS = `

////////////////////////////////////////////////////////
// BEGIN EPILOGUE //////////////////////////////////////
////////////////////////////////////////////////////////

if (window.main) {
    main(); // run the main function, if it exists
}
`

        let generatedJS = "TODO: reinstate JS";
        
        (document.getElementById("generatedJS") as any).innerText = generatedJS;

        const prologueC = `
////////////////////////////////////////////////////////
// BEGIN PRELUDE ///////////////////////////////////////
////////////////////////////////////////////////////////

#include "stdlib.h"
#include "stdio.h"
#include "stdint.h"

struct bismuth_function {
    void* (*func)();
};

struct bismuth_string {
    char* value;
};

struct bismuth_vector {
    void** items;
    intptr_t length;
};

struct bismuth_vector* _make_bismuth_nil() {
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->items = 0;
    result->length = 0;
    return result;
}
void* _make_bismuth_cons(void* head, void* tail) {
    struct bismuth_vector* tail_vector = tail;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = tail_vector->length + 1;
    result->items = malloc(sizeof(void*) * (size_t)result->length);
    for (intptr_t i = 0; i < tail_vector->length; i++) {
        result->items[i+1] = tail_vector->items[i];
    }
    result->items[0] = head;
    return result;
}
void* _make_bismuth_snoc(void* init, void* last) {
    struct bismuth_vector* init_vector = init;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = init_vector->length + 1;
    result->items = malloc(sizeof(void*) * (size_t)result->length);
    for (intptr_t i = 0; i < init_vector->length; i++) {
        result->items[i] = init_vector->items[i];
    }
    result->items[init_vector->length] = last;
    return result;
}

void* _make_bismuth_unit() {
    return 0;
}

void* print_declare_builtin(void* self, void* line) {
    (void)self;
    printf("%s\\n", (const char*)line);
    return _make_bismuth_unit();
}

void* show_declare_builtin() {
    // not implemented
    return 0;
}

void* at_declare_builtin(void* self, void* array, void* index) {
    (void)self;
    struct bismuth_vector* vector_array = array;
    intptr_t int_index = (intptr_t)index;
    if (int_index < 0 || int_index >= vector_array->length) {
        printf("out-of-bounds index; index %ld in array of length %ld\\n", int_index, vector_array->length);
        exit(1);
        return 0;
    }
    return vector_array->items[int_index];
}

void* appendArray_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    struct bismuth_vector* first_vector = first;
    struct bismuth_vector* second_vector = second;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = first_vector->length + second_vector->length;
    result->items = malloc(sizeof(void*) * (size_t)result->length);
    for (intptr_t i = 0; i < first_vector->length; i++) {
        result->items[i] = first_vector->items[i];
    }
    for (intptr_t i = 0; i < second_vector->length; i++) {
        result->items[i+first_vector->length] = second_vector->items[i];
    }
    return result;
}

void* appendString_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    const char* first_string = first;
    const char* second_string = second;
    size_t comb_len = 0;
    for (const char* c = first_string; *c; ++c) {
        comb_len++;
    }
    for (const char* c = second_string; *c; ++c) {
        comb_len++;
    }
    char* str = malloc(comb_len + 1);
    char* o = str;
    for (const char* c = first_string; *c; ++c) {
        *o++ = *c;
    }
    for (const char* c = second_string; *c; ++c) {
        *o++ = *c;
    }
    *o = 0;
    return str;
}

void* length_declare_builtin(void* self, void* array) {
    (void)self;
    struct bismuth_vector* array_vector = array;
    return (void*)(intptr_t)array_vector->length;
}

void* less_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    intptr_t x_int = (intptr_t)x;
    intptr_t y_int = (intptr_t)y;
    return (void*)(intptr_t)(x_int < y_int);
}

void* add_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    intptr_t x_int = (intptr_t)x;
    intptr_t y_int = (intptr_t)y;
    return (void*)(intptr_t)(x_int + y_int);
}

////////////////////////////////////////////////////////
// BEGIN PROGRAM ///////////////////////////////////////
////////////////////////////////////////////////////////

`;

        const epilogueC = ``;

        let generatedC = prologueC;
        
        const generatedDeclarations: C.Declaration[] = [];
        graphC.each("DeclareStruct", s => {
            generatedDeclarations.push(s.declaration);
        });
        graphC.each("DeclareEnum", e => {
            generatedDeclarations.push(e.declaration);
        });
        let entryFunction = "unknown";
        graphC.each("DeclareFunction", f => {
            generatedDeclarations.push(f.declaration.func);
            generatedDeclarations.push(f.declaration.value);
            if (f.name.text == "main") {
                entryFunction = f.declaration.value.name.name;
            }
        });
        graphC.each("DeclareBuiltinVar", f => {
            generatedDeclarations.push(new C.Global(f.register, new C.Allocate("bismuth_function", {func: new C.Load(f.name.text + "_declare_builtin")}), "struct bismuth_function*"));
        });
        graphC.each("DeclareInterface", i => {
            generatedDeclarations.push(i.interfaceRecord);
            for (let m in i.declarations.methods) {
                generatedDeclarations.push(i.declarations.methods[m].func);
                generatedDeclarations.push(i.declarations.methods[m].value);
            }
        });
        graphC.each("DeclareInstance", i => {
            generatedDeclarations.push(i.declarations.record);
            generatedDeclarations.push(i.declarations.create);
            for (let m of i.declarations.implement) {
                generatedDeclarations.push(m);
            }
        });

        for (let d of generatedDeclarations) {
            const extra = d.predeclare();
            generatedC += "\n" + extra + "\n";
        }

        for (let d of generatedDeclarations) {
            const extra = d.declare();
            if (extra && extra.in == "static") {
                generatedC += "\n" + extra.code + "\n";
            }
        }

        generatedC += "int main() {";
        for (let d of generatedDeclarations) {
            const extra = d.declare();
            if (extra && extra.in == "main") {
                generatedC += "\n" + C.indentBodyString(extra.code) + "\n";
            }
        }
        generatedC += `\n\n\t// entry point:\n\t${entryFunction}->func();`
        generatedC += "\n}\n";
        
        (document.getElementById("generatedC") as any).innerText = generatedC;
        (document.getElementById("errors") as any).innerText = "";
    } catch (e) {
        (document.getElementById("generatedJS") as any).innerText = "";
        (document.getElementById("generatedC") as any).innerText = "";
        (document.getElementById("errors") as any).innerText = e.message || e;
    }
}

export { compile };
