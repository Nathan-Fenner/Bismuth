
// TODO:

// interface methods cannot be generic
// no way to construct / deconstruct enum values
// no way to declare instances
// no way to declare effects
// non-trivial effects are not implemented (no code gen)
// polymorphism is slow and always boxed

import {Omit, Overwrite, unique} from './utility'

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

import {
    ParserFor,
    pure,
    matched,
} from './parsing';

import { parseModule } from './parse_ast';

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
    | Ref<"TypeSelf">
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
    | Ref<"StatementIf">
    | Ref<"StatementWhile">

type DeclareRef
    = Ref<"DeclareBuiltinType">
    | Ref<"DeclareBuiltinVar">
    | Ref<"DeclareStruct">
    | Ref<"DeclareEnum">
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
    ExpressionVariable: {type: "variable", at: Token, scope: Ref<"Scope">, variable: Token},
    ExpressionDot:      {type: "dot",      at: Token, scope: Ref<"Scope">, object: ExpressionRef, field: Token},
    ExpressionCall:     {type: "call",     at: Token, scope: Ref<"Scope">, hasEffect: boolean, func: ExpressionRef, arguments: ExpressionRef[]},
    ExpressionOperator: {type: "operator", at: Token, scope: Ref<"Scope">, operator: Token, func: ExpressionRef, left: ExpressionRef | null, right: ExpressionRef},
    ExpressionObject:   {type: "object",   at: Token, scope: Ref<"Scope">, name: Token, fields: {name: Token, value: ExpressionRef}[]},
    ExpressionArray:    {type: "array",    at: Token, scope: Ref<"Scope">, fields: ExpressionRef[]},
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
    StatementBlock:    {is: "block",    at: Token, scope: Ref<"Scope">, body: StatementRef[]},

    TypeSelf:     {type: "self", self: Token},
    TypeName:     {type: "name", name: Token, parameters: TypeRef[], scope: Ref<"Scope">},
    TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[] , returns: TypeRef | null},

    DeclareBuiltinType: {declare: "builtin-type", name: Token, parameterCount: number}, // TODO: constraints on parameters?
    DeclareBuiltinVar:  {declare: "builtin-var",  name: Token, valueType: TypeRef},
    DeclareGeneric:     {declare: "generic",      name: Token, constraintNames: Token[], scope: Ref<"Scope">},
    DeclareStruct:      {declare: "struct",       name: Token, generics: Ref<"DeclareGeneric">[], fields: {name: Token, type: TypeRef}[]},
    DeclareEnum:        {declare: "enum",         name: Token, generics: Ref<"DeclareGeneric">[], variants: {name: Token, type: TypeRef | null}[]},
    DeclareFunction:    {declare: "function",     name: Token, scale: {scale: "global"} | {scale: "local" | "instance", unique: string}, effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: Ref<"DeclareVar">[], returns: TypeRef | null, body: Ref<"StatementBlock">},
    DeclareMethod:      {declare: "method",       name: Token, interface: Ref<"DeclareInterface">, type: TypeRef, valueType: TypeRef},
    DeclareInterface:   {declare: "interface",    name: Token, methods: Ref<"DeclareMethod">[]},
    DeclareInstance:    {declare: "instance",     name: Token, type: Ref<"TypeName">, generics: Ref<"DeclareGeneric">[], methods: Ref<"DeclareFunction">[]},
    DeclareVar:         {declare: "var",          name: Token, type: TypeRef},

    SatisfyInstance: {declare: "instance", interface: Ref<"DeclareInterface">, source: Ref<"DeclareGeneric"> | Ref<"DeclareStruct">, generics: {constraints: Ref<"DeclareInterface">[]}[]}, // TODO: non-struct instances

    Scope: {
        parent: Ref<"Scope"> | null,
        // introducedBy: null | Ref<"DeclareFunction"> | Ref<"DeclareVar"> | Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"StatementWhile">,
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
        let graph = new GraphOf<ProgramGraph>({ // TODO: do this lazily so that it's hidden
            ExpressionInteger: {},
            ExpressionString: {},
            ExpressionVariable: {},
            ExpressionDot: {},
            ExpressionCall: {},
            ExpressionOperator: {},
            ExpressionObject: {},
            ExpressionArray: {},
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
            StatementBlock: {},
            TypeSelf: {},
            TypeName: {},
            TypeFunction: {},
            DeclareBuiltinType: {},
            DeclareBuiltinVar: {},
            DeclareStruct: {},
            DeclareEnum: {},
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
                for (let s: Ref<"Scope"> | null = scope; s; s = graph.get(scope).parent) {
                    if (graph.get(s).allowsSelf) {
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
                        constraintNames: generic.constraints,
                        scope: scope,
                    })),
                    arguments: t.arguments.map(a => graphyType(a, scope)),
                    returns: t.returns ? graphyType(t.returns, scope) : null,
                });
            } else {
                throw "TODO: implement type " + t.type;
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
                return graph.insert("ExpressionObject", {
                    type: "object",
                    at: e.at,
                    scope,
                    name: e.name,
                    fields: e.fields.map(({name, value}) => ({name, value: graphyExpression(value, scope)})),
                })
            } else if (e.expression == "array") {
                return graph.insert("ExpressionArray", {
                    type: "array",
                    at: e.at,
                    scope,
                    fields: e.items.map(item => graphyExpression(item, scope)),
                })
            }
            throw {message: "not implemented - graphyExpression", e};
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
            }
            // TODO: remaining statements: yield / switch.
            throw {message: "not implemented - graphyStatement", s};
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
            "Int": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Int"), parameterCount: 0}),
            "Unit": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Unit"), parameterCount: 0}),
            "Bool": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Bool"), parameterCount: 0}),
            "String": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("String"), parameterCount: 0}),
            "Array": graph.insert("DeclareBuiltinType", {declare: "builtin-type", name: builtinToken("Array"), parameterCount: 1}),
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
                arguments: [graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}), builtinTypeNames.Int],
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
                    graph.insert("TypeName", {type: "name", name: builtinToken("Array"), parameters: [generics.T], scope: builtinTypeScope}),
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
                    constraintNames: generic.constraints,
                    scope: globalScope,
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
                let refTo: Ref<"DeclareStruct"> = graph.insert("DeclareStruct", {
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
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                let inScope: {[name: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    if (graph.get(generic).name.text in inScope) {
                        throw `generic variable '${graph.get(generic).name.text}' is redeclared at ${graph.get(generic).name.location}`;
                    }
                    inScope[graph.get(generic).name.text] = generic;
                }
                let refTo: Ref<"DeclareEnum"> = graph.insert("DeclareEnum", {
                    declare:  "enum",
                    name:     declaration.name,
                    generics: generics,
                    variants:   alternates.variants.map(variant => ({name: variant.name, type: variant.type ? graphyType(variant.type, scope) : null})),
                });
                let scope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
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
                    constraintNames: generic.constraints,
                    scope: globalScope,
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
                graph.get(argScope).returnsFrom = refTo; // add backwards link
                if (func.name.text in graph.get(globalScope).inScope) {
                    throw `global with name '${func.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[func.name.text]).name.location} but declared again as function at ${func.name.location}`;
                }
                graph.get(globalScope).inScope[func.name.text] = refTo;
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
                graph.get(refTo).methods = iface.methods.map(method => {
                    const regularType = graphyType(method.type, interfaceScope);
                    const extraGeneric = graph.insert("DeclareGeneric", {
                        declare: "generic",
                        name: {text: "Self", location: method.name.location, type: "special"},
                        constraintNames: [iface.name],
                        scope: globalScope,
                    });
                    const original = graph.get(regularType);
                    if (original.type != "function") {
                        throw "ICE 1712";
                    }
                    const replaceSelf = (t: TypeRef): TypeRef => {
                        if (t.type == "TypeName") {
                            return t;
                        } else if (t.type == "TypeSelf") {
                            // here we return the generic reference
                            return graph.insert("TypeName", {
                                type: "name",
                                name: {text: "Self", location: graph.get(t).self.location, type: "special"},
                                parameters: [],
                                scope: graph.insert("Scope", {
                                    inScope: {"Self": extraGeneric},
                                    parent: interfaceScope,
                                }),
                            });
                        } else if (t.type == "TypeFunction") {
                            const func = graph.get(t);
                            return graph.insert("TypeFunction", {
                                type: "function",
                                effects: func.effects,
                                generics: func.generics,
                                arguments: func.arguments.map(replaceSelf),
                                returns: func.returns ? replaceSelf(func.returns) : null,
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
                if (iface.name.text in graph.get(globalScope).inScope) {
                    throw `interface with name '${iface.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[iface.name.text]).name.location} but declared again at ${iface.name.location}`;
                }
                graph.get(globalScope).inScope[iface.name.text] = refTo;
                // adds each method to the global namespace
                for (let methodRef of graph.get(refTo).methods) {
                    const method = graph.get(methodRef);
                    if (method.name.text in graph.get(globalScope).inScope) {
                        throw `method with name '${method.name.text}' already declared at ${graph.get(graph.get(globalScope).inScope[method.name.text]).name.location} but declared again at ${method.name.location}`;
                    }
                    graph.get(globalScope).inScope[method.name.text] = methodRef;
                }
            } else if (declaration.declare == "instance") {
                // Insert the interface.
                //if (declaration.generics.length != 0) {
                //    throw "instance declaration cannot handle generic types yet.";
                //}
                const generics = declaration.generics.map(generic => graph.insert("DeclareGeneric", {
                    declare: "generic",
                    name: generic.name,
                    constraintNames: generic.constraints,
                    scope: globalScope,
                }));
                const inScope: {[n: string]: Ref<"DeclareGeneric">} = {};
                for (let generic of generics) {
                    inScope[graph.get(generic).name.text] = generic;
                }
                const instanceScope = graph.insert("Scope", {
                    parent: globalScope,
                    inScope: inScope,
                });
                const implementingType = graphyType(declaration.type, instanceScope);
                if (implementingType.type != "TypeName") {
                    throw `instance for class ${"TODO"} for type ${prettyType(implementingType, graph)} must be a named type, but is not.`;
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
                            if (graph.get(argumentScope).inScope[graph.get(argument).name.text]) {
                                throw `TODO: interface method argument in implementation uses repeated name`;
                            }
                            graph.get(argumentScope).inScope[graph.get(argument).name.text] = argument;
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
                        graph.get(argumentScope).returnsFrom = methodReference;
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
        const graphN = graphK.compute<{ExpressionVariable: {variableDeclaration: Ref<"DeclareVar"> | Ref<"DeclareFunction"> | Ref<"DeclareBuiltinVar"> | Ref<"DeclareMethod">}, DeclareGeneric: {constraints: Ref<"DeclareInterface">[]}}>({
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
            }
        });
        
        type TypeIdenticalShape = {
            TypeName: {type: "name", name: Token, parameters: TypeRef[], typeDeclaration: Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareGeneric"> | Ref<"DeclareBuiltinType">},
            TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[], returns: null | TypeRef},
            TypeSelf: {type: "self"},
        }
        function typeIdentical(t1: TypeRef, t2: TypeRef, g: GraphOf<TypeIdenticalShape>, equal: ReadonlyArray<{a: Ref<"DeclareGeneric">, b: Ref<"DeclareGeneric">}> = []): boolean {
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
            } else if (t1.type == "TypeSelf") {
                if (t2.type == "TypeSelf") {
                    return true;
                }
                return false;
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

        type TypeSubstituteShape = {
            TypeName: {type: "name", name: Token, typeDeclaration: Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareBuiltinType"> | Ref<"DeclareGeneric">, parameters: TypeRef[]},
            TypeSelf: {type: "self"},
            TypeFunction: {type: "function", effects: Token[], generics: Ref<"DeclareGeneric">[], arguments: TypeRef[], returns: null | TypeRef},
        }
        function typeSubstitute(t: TypeRef, g: GraphOf<TypeSubstituteShape>, variables: Map<Ref<"DeclareGeneric">, TypeRef>): TypeRef {
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
                    typeDeclaration: n.typeDeclaration,
                });
            } else if (t.type == "TypeSelf") {
                return t;
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
        function typeSelfSubstitute(t: TypeRef, g: GraphOf<TypeSubstituteShape>, replaced: TypeRef): TypeRef {
            if (t.type == "TypeName") {
                const n = g.get(t);
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
                const f = g.get(t);
                return g.insert("TypeFunction", {
                    type: "function",
                    effects: f.effects,
                    generics: f.generics,
                    arguments: f.arguments.map(a => typeSelfSubstitute(a, g, replaced)),
                    returns: f.returns ? typeSelfSubstitute(f.returns, g, replaced) : null,
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
            } else if (pattern.type == "TypeSelf") {
                if (against.type != "TypeSelf") {
                    return `cannot match ${prettyType(against, result)} with expected ${prettyType(pattern, result)}`;
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

        type PrettyTypeShape = {
            TypeName: { type: "name", name: Token, parameters: TypeRef[] },
            TypeFunction: { type: "function", arguments: TypeRef[], returns: null | TypeRef },
            TypeSelf: { type: "self", },
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
            } else {
                const impossible: never = ts;
                return impossible;
            }
        }

        type PrettyExpressionShape = Overwrite<ProgramGraph, PrettyTypeShape>;
        function prettyExpression(e: ExpressionRef, g: GraphOf<PrettyExpressionShape>): string {
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

        // remove the scope from types, where it is no longer needed (since they've been resolved).
        const graphN1 = graphN.removeField("TypeName", "scope"); // .removeField<"TypeName", "scope">("TypeName", "scope").removeField<"DeclareGeneric", "scope">("DeclareGeneric", "scope");

        const singletonInstanceMap: Map<Ref<"DeclareStruct"> | Ref<"DeclareEnum"> | Ref<"DeclareBuiltinType">, Ref<"DeclareInstance">> = new Map();
        // The singletonInstanceMap is an evil global variable that holds all instance declarations.
        // These exclude local ones (like those from DeclareGeneric) because you can already determine where those are from.
        // This is also the point that we verify that these instances satisfy the interface required.

        let instanceID = 1000;

        const graphN2 = graphN1.compute<{DeclareInstance: {creatorID: string}}>({
            DeclareInstance: {
                creatorID: (inst, result, instRef) => {
                    // check the inst!
                    const instanceInterfaceRef = lookupScope(graphN1, globalScope, inst.name.text);
                    if (instanceInterfaceRef == null) {
                        throw `cannot satisfy unknown interface '${inst.name.text}' at ${inst.name.location}`; // TODO: error details
                    }
                    if (instanceInterfaceRef.type != "DeclareInterface") {
                        throw `cannot satisfy non-interface in instance declaration`; // TODO: error details
                    }
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
                    if (instanceTypeDeclaration.type == "DeclareStruct" || instanceTypeDeclaration.type == "DeclareEnum") {
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
            ExpressionDot: {objectType: Ref<"TypeName">, structDeclaration: Ref<"DeclareStruct">},
        } & {
            ReferenceVar: {referenceType: TypeRef},
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
                objectType: (self, result): Ref<"TypeName"> => {
                    const objectTypeRef = result.get(self.object).expressionType;
                    const objectType = result.get(objectTypeRef);
                    if (objectTypeRef.type != "TypeName") {
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-named type`;
                    }
                    return objectTypeRef;
                },
                structDeclaration: (self, result): Ref<"DeclareStruct"> => {
                    const objectTypeDeclaration = result.get(self.objectType).typeDeclaration;
                    if (objectTypeDeclaration.type != "DeclareStruct") {
                        throw `cannot access field '${self.field.text}' at ${self.field.location} on object with non-struct type`;
                    }
                    return objectTypeDeclaration;
                },
                expressionType: (self, result) => {
                    const objectTypeRef = result.get(self.object).expressionType;
                    const objectType = result.get(objectTypeRef);
                    const structDeclaration = result.get(self.structDeclaration);
                    const variables = new Map<Ref<"DeclareGeneric">, TypeRef>();
                    for (let i = 0; i < structDeclaration.generics.length; i++) {
                        variables.set(structDeclaration.generics[i], result.get(self.objectType).parameters[i]);
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
                    return result.insert("TypeName", {
                        type: "name",
                        name: struct.name,
                        parameters: struct.generics.map(g => unified.get(g)![0]),
                        typeDeclaration: declaration,
                    });
                }
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
            ReferenceVar: {
                referenceType: (self, result) => {
                    const declaration = lookupScope(result, self.scope, self.name.text);
                    if (!declaration) {
                        throw `variable reference '${self.name.text}' at ${self.name.location} does not refer to any name in scope.`;
                    }
                    if (declaration.type != "DeclareVar") {
                        throw `variable reference '${self.name.text}' at ${self.name.location} does not refer to a variable.`;
                    }
                    const variable = result.get(declaration);
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
            instance: "generic",
            interface: string,
            generic: Token,
        } | {
            instance: "name",
            name: string,
            interface: string,
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
            const namedRef: Ref<"TypeName"> = t;
            const named = graphT.get(namedRef);
            const declRef = named.typeDeclaration;
            if (declRef.type == "DeclareGeneric") {
                const decl = graphT.get(declRef);
                let okay = false;
                for (let satisfies of decl.constraints) {
                    if (satisfies == c) {
                        okay = true;
                    }
                }
                if (!okay) {
                    throw `generic type ${named.name.text} declared at ${named.name.location} does not satisfy interface ${graphT.get(c).name.text}`;
                }
                return {
                    instance: "generic",
                    interface: graphT.get(c).name.text,
                    generic: named.name,
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
                    instance: "name",
                    name: named.name.text,
                    interface: graphT.get(c).name.text,
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
        const graphS = graphTI.compute<{[s in StatementRef["type"]]: {checked: true}}>({
            StatementDo: {
                checked: () => true, // TODO: complain about unused returns or invalid drops
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
        });

        const graphFlow = graphS.compute<{[s in StatementRef["type"]]: {reachesEnd: "yes" | "no" | "maybe", canBreak: boolean}}>({
            StatementDo: {
                reachesEnd: () => "yes",
                canBreak: () => false,
            },
            StatementVar: {
                reachesEnd: () => "yes",
                canBreak: () => false,
            },
            StatementAssign: {
                reachesEnd: () => "yes",
                canBreak: () => false,
            },
            StatementReturn: {
                reachesEnd: () => "no",
                canBreak: () => false,
            },
            StatementBreak: {
                reachesEnd: () => "no",
                canBreak: () => true,
            },
            StatementContinue: {
                reachesEnd: () => "no",
                canBreak: () => false,
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
            },
            StatementWhile: {
                reachesEnd: () => "yes",
                canBreak: () => false,
            },
        });

        // Check for functions missing returns.
        graphFlow.each("DeclareFunction", (func) => {
            if (func.returns && graphFlow.get(func.body).reachesEnd != "no") {
                throw `control flow may reach the end of function '${func.name.text}' declared at ${func.name.location}`;
            }
        });

        const indentString = (s: string) => s.split("\n").map(l => "\t" + l).join("\n");

        const graphGenerate = graphFlow.compute<{
            [e in ExpressionRef["type"]]: {js: string, c: {is: string, by: string}}
        } & {
            [s in StatementRef["type"] | DeclareRef["type"]]: {js: string, c: string}
        } & {
            ReferenceVar: {js: string, c: {get: () => {is: string, by: string}, set: (from: string) => string}},
            ReferenceDot: {js: string, c: {get: () => {is: string, by: string}, set: (from: string) => string}},
        } & {
            DeclareFunction: {initC: string, preC: string, emitName: string}
        } & {
            DeclareInterface: {initC: string}
        } & {
            DeclareInstance: {c: string, preC: string} // TODO: JS
        }>({
            ExpressionInteger: {
                js: (self) => self.value.text,
                c: (self) => {
                    const is = uniqueName();
                    return {
                        by: `void* ${is} = _make_bismuth_int(${self.value.text});`,
                        is,
                    };
                }
            },
            ExpressionString: {
                js: (self) => self.value.text,
                c: (self) => {
                    const is = uniqueName();
                    return {
                        by: `void* ${is} =_make_bismuth_string(${self.value.text});`, // TODO: use a string-type that's not C-string.
                        is,
                    };
                },
            },
            ExpressionVariable: {
                js: (self) => {
                    if (self.variableDeclaration.type == "DeclareMethod") {
                        return `// TODO: method instantiation for '${self.variable.text}' requires instance lookup`;
                    }
                    return self.variable.text; // ensure compatibility of scoping rules
                },
                c: (self) => {
                    if (self.variableDeclaration.type == "DeclareMethod") {
                        return {
                            by: `// caller passes record to method`,
                            is: "_bv_" + self.variable.text,
                        };
                    }
                    const is = uniqueName();
                    return {
                        by: `void* ${is} = _bv_${self.variable.text};`, // TODO: verify compatibility of scoping rules
                        is,
                    };
                },
            },
            ExpressionDot: {
                js: (self, result) => `(${result.get(self.object).js}.${self.field.text})`,
                c: (self, result) => {
                    const is = uniqueName();
                    return {
                        by: result.get(self.object).c.by + "\n" + `void* ${is} = (((struct _bismuth_struct_${result.get(self.objectType).name.text}*)${result.get(self.object).c.is})->${self.field.text});`,
                        is,
                    };
                },
            },
            ExpressionCall: {
                // TODO: any other behavior?
                js: (self, result) => {
                    const func = result.get(self.func).js;
                    const instanceToCode = (x: Instance): string => {
                        if (x.instance == "generic") {
                            return `_bi_gen_${x.generic.text}_con_${x.interface}`;
                        } else {
                            const requiredInterfaces = x.requirements.map(instanceToCode).join(", ");
                            return `_bi_make_instance_${x.name}_iface_${x.interface}(${requiredInterfaces})`;
                        }
                    };
                    const args = self.passInstances.map(instanceToCode).concat(self.arguments.map(arg => result.get(arg).js)).join(", ");
                    if (func.match(/\w+/)) {
                        return `${func}(${args})`;
                    } else {
                        return `(${func})(${args})`;
                    }
                },
                c: (self, result) => {
                    const is = uniqueName();
                    let by = result.get(self.func).c.by;
                    for (let arg of self.arguments) {
                        by += "\n" + result.get(arg).c.by;
                    }
                    const instanceToCode = (x: Instance): string => {
                        if (x.instance == "generic") {
                            return `_bi_gen_${x.generic.text}_con_${x.interface}`;
                        } else {
                            const requiredInterfaces = x.requirements.map(instanceToCode).join(", ");
                            return `_bi_make_instance_${x.name}_iface_${x.interface}(${requiredInterfaces})`;
                        }
                    };
                    const cInstanceArguments = self.passInstances.map(instanceToCode);
                    const cFormalArguments = self.arguments.map(arg => result.get(arg).c.is);
                    const cArguments = [result.get(self.func).c.is].concat(cInstanceArguments, cFormalArguments);
                    by += `\nvoid* ${is} = ((struct bismuth_function*)${result.get(self.func).c.is})->func(${cArguments.join(", ")});`;
                    return {
                        by,
                        is,
                    };
                },
            },
            ExpressionOperator: {
                js: (self, result) => "TODO",
                c: (self, result) => {
                    const is = uniqueName();
                    let by = result.get(self.func).c.by;
                    const operatorArguments = self.left == null ? [self.right] : [self.left, self.right];
                    for (let arg of operatorArguments) {
                        by += "\n" + result.get(arg).c.by;
                    }
                    const instanceToCode = (x: Instance): string => {
                        if (x.instance == "generic") {
                            return `_bi_gen_${x.generic.text}_con_${x.interface}`;
                        } else {
                            const requiredInterfaces = x.requirements.map(instanceToCode).join(", ");
                            return `_bi_make_instance_${x.name}_iface_${x.interface}(${requiredInterfaces})`;
                        }
                    };
                    const cInstanceArguments = self.passInstances.map(instanceToCode);
                    const cFormalArguments = operatorArguments.map(arg => result.get(arg).c.is);
                    const cArguments = [result.get(self.func).c.is].concat(cInstanceArguments, cFormalArguments);
                    by += `\nvoid* ${is} = ((struct bismuth_function*)${result.get(self.func).c.is})->func(${cArguments.join(", ")});`;
                    return {
                        by,
                        is,
                    };
                },
            },
            ExpressionObject: {
                js: (self, result) => `{${self.fields.map(field => field.name.text + ":" + result.get(field.value).js).join(', ')}}`,
                c: (self, result) => {
                    let by = "";
                    for (let field of self.fields) {
                        by += result.get(field.value).c.by + "\n";
                    }
                    let is = uniqueName();
                    by += `void* ${is} = _make_bismuth_struct_${self.name.text}(${self.fields.sort((a,b) => a.name.text < b.name.text ? -1 : 1).map(field => result.get(field.value).c.is).join(", ")});`;
                    return {by, is};
                },
            },
            ExpressionArray: {
                js: (self, result) => `[${self.fields.map(field => result.get(field).js).join(", ")}]`,
                c: (self, result) => {
                    const is = uniqueName();
                    let by = `void* ${is} = _make_bismuth_nil();`;
                    for (let field of self.fields) {
                        by += `\n${result.get(field).c.by}`;
                        by += `\n${is} = _make_bismuth_snoc(${is}, ${result.get(field).c.is});`;
                    }
                    return {
                        by,
                        is,
                    };
                },
            },
            ReferenceVar: {
                js: (self) => self.name.text,
                c: (self) => ({
                    get: () => ({is: `_bv_${self.name.text}`, by: ""}),
                    set: (from: string) => `_bv_${self.name.text} = ${from};`,
                }),
            },
            ReferenceDot: {
                js: (self, result) => `${result.get(self.object).js}.${self.field.text}`,
                c: (self, result) => {
                    return {
                        get: () => {
                            let is = uniqueName();
                            let by = `void* ${is} = ((struct _bismuth_struct_${result.get(self.referenceStruct).name.text}*)${result.get(self.object).c.get()})->${self.field.text};`;
                            return {
                                by: "",
                                is,
                            };
                        },
                        set: (from: string) => {
                            let {is: objectIs, by: objectBy} = result.get(self.object).c.get();
                            let by = objectBy;
                            let is = uniqueName();
                            by += `void* ${is} = _make_bismuth_struct_${result.get(self.referenceStruct).name.text}(${result.get(self.referenceStruct).fields.sort((a, b) => a.name.text<b.name.text?-1:1).map(f => {
                                if (f.name.text != self.field.text) {
                                    return `((struct _bismuth_struct_${result.get(self.referenceStruct).name.text}*)${objectIs})->${f.name.text}`;
                                } else {
                                    return from;
                                }
                            }).join(", ")});`;
                            return by + "\n" + result.get(self.object).c.set(is);
                        },
                    };
                },
            },
            StatementDo: {
                js: (self, result) => result.get(self.expression).js + ";",
                c: (self, result) => {
                    return result.get(self.expression).c.by + `\n(void)${result.get(self.expression).c.is};`;
                },
            },
            StatementVar: {
                js: (self, result) => `let ${result.get(self.declare).name.text} = ${result.get(self.expression).js};`,
                c: (self, result) => {
                    // TODO: better type precision (for efficiency)
                    let compiled = result.get(self.expression).c.by;
                    compiled += `\nvoid* _bv_${result.get(self.declare).name.text} = ${result.get(self.expression).c.is};`;
                    return compiled;
                },
            },
            StatementAssign: {
                js: (self, result) => `${result.get(self.reference).js} = ${result.get(self.expression).js};`,
                c: (self, result) => {
                    return result.get(self.expression).c.by + "\n" + result.get(self.reference).c.set(result.get(self.expression).c.is);
                },
            },
            StatementReturn: {
                js: (self, result) => self.expression ? `return ${result.get(self.expression).js};` : `return null;`,
                c: (self, result ) => {
                    if (self.expression) {
                        return `${result.get(self.expression).c.by}\nreturn ${result.get(self.expression).c.is};`;
                    } else {
                        return `return _make_bismuth_unit();`;
                    }
                },
            },
            StatementBreak: {
                js: () => "break;",
                c: () => "break;",
            },
            StatementContinue: {
                js: () => "continue;",
                c: () => "continue;",
            },
            StatementIf: {
                js: (self, result) => {
                    const thenBody = result.get(self.then).js;
                    const elseBody = result.get(self.otherwise).js;
                    if (elseBody.match(/\s*\{\s*\}\s*/)) {
                        return `if (${result.get(self.condition).js}) ${thenBody}`;
                    }
                    return `if (${result.get(self.condition).js}) ${thenBody} else ${elseBody}`;
                },
                c: (self, result) => {
                    const thenBody = result.get(self.then).c;
                    const elseBody = result.get(self.otherwise).c;
                    if (elseBody.match(/\s*\{\s*\}\s*/)) {
                        return `${result.get(self.condition).c.by}\nif (((struct bismuth_bool*)${result.get(self.condition).c.is})->value) ${thenBody}`;
                    }
                    return `${result.get(self.condition).c.by}\nif (((struct bismuth_bool*)${result.get(self.condition).c.is})->value) ${thenBody} else ${elseBody}`;
                },
            },
            StatementWhile: {
                js: (self, result) => `while (${result.get(self.condition).js}) ${result.get(self.body).js}`,
                c: (self, result) => {
                    let code = `while (1) {`;
                    code += "\n" + indentString(result.get(self.condition).c.by);
                    code += `\n\tif (!((struct bismuth_bool*)${result.get(self.condition).c.is})->value) {`;
                    code += "\n\t\tbreak;";
                    code += "\n\t}";
                    code += "\n" + indentString(result.get(self.body).c);
                    code += "\n}";
                    return code;
                },
            },
            StatementBlock: {
                js: (self, result) => `{${"\n\t" + self.body.map(s => result.get(s).js).join("\n").replace(/\n/g, "\n\t") + "\n"}}`,
                c: (self, result) => `{${"\n\t" + self.body.map(s => result.get(s).c).join("\n").replace(/\n/g, "\n\t") + "\n"}}`,
            },
            DeclareBuiltinType: {
                js: (self) => `// builtin ${self.name.text}`,
                c: (self) => `// builtin ${self.name.text}`,
            },
            DeclareBuiltinVar: {
                js: (self, result) => `// builtin ${self.name.text} has Bismuth-type ${prettyType(self.valueType, result)}`,
                c: (self, result) => `// builtin ${self.name.text} has Bismuth-type ${prettyType(self.valueType, result)}`,
            },
            DeclareStruct: {
                js: (self) => `// struct ${self.name.text} has fields ${self.fields.map(f => f.name.text).join(", ")}`,
                c: (self, result) => {
                    // declare the struct type, and a maker for that type.
                    const structType = "struct _bismuth_struct_" + self.name.text;
                    let declaration = structType + " {";
                    for (let field of self.fields) {
                        declaration += "\n\tvoid* " + field.name.text + ";";
                    }
                    declaration += "\n};\n";
                    declaration += `${structType}* _make_bismuth_struct_${self.name.text}(${self.fields.sort((a, b) => a.name.text < b.name.text ? -1 : 1).map(f => "void* " + f.name.text).join(", ")}) {`;
                    declaration += `\n\t${structType}* _result = malloc(sizeof(${structType}));`;
                    for (let field of self.fields) {
                        declaration += `\n\t_result->${field.name.text} = ${field.name.text};`
                    }
                    declaration += "\n\treturn _result;";
                    declaration += "\n}\n";
                    return declaration;
                },
            },
            DeclareEnum: {
                js: (self) => `// enum ${self.name.text} has cases ${self.variants.map(f => f.name.text).join(", ")}`,
                c: () => "TODO // enum",
            },
            DeclareGeneric: {
                js: (self) => `// generic ${self.name.text}`,
                c: (self) => `// generic ${self.name.text}`,
            },
            DeclareFunction: {
                js: (self, result) => {
                    return `function ${self.name.text}(${self.arguments.map(arg => result.get(arg).name.text).join(", ")}) ${result.get(self.body).js}`;
                },
                emitName: (self, result) => {
                    return self.scale.scale == "global" ? self.name.text : self.name.text + "_" + self.scale.unique;
                },
                c: (self, result) => {
                    let func = self.preC.substr(0, self.preC.length-1) + " " + result.get(self.body).c;
                    if (result.get(self.body).reachesEnd != "no") {
                        func.trim();
                        func = func.substr(0, func.length-1) + "\treturn _make_bismuth_unit();\n}\n";
                    }
                    let closure = `struct bismuth_function* _bv_${self.emitName};`
                    return func + "\n" + closure;
                },
                initC: (self, result) => {
                    return `_bv_${self.emitName} = make_bismuth_function(bismuth_declare_func_${self.emitName});`;
                },
                preC: (self, result) => {
                    const cInstanceParameters: string[] = ([] as string[]).concat(...self.generics.map(generic => {
                        const out: string[] = [];
                        for (let constraint of result.get(generic).constraints) {
                            out.push(`struct _bi_record_${result.get(constraint).name.text} _bi_gen_${result.get(generic).name.text}_con_${result.get(constraint).name.text}`);
                        }
                        return out;
                    }));
                    const cFormalParameters = self.arguments.map(arg => `void* _bv_${result.get(arg).name.text}`);
                    return `void* bismuth_declare_func_${self.emitName}(${["__attribute__((unused)) struct bismuth_function* self"].concat(cInstanceParameters, cFormalParameters).join(", ")});`;
                },
            },
            DeclareMethod: {
                js: (self) => `// TODO method ${self.name.text}`,
                c: (self) => `// TODO method ${self.name.text}`,
            },
            DeclareInterface: {
                js: (self) => `// TODO interface ${self.name.text}`,
                c: (self, result) => {
                    // (1) declare the instance record
                    const methodFields = self.methods.map(method => `\tstruct bismuth_function* ${result.get(method).name.text};`);
                    const instanceRecord = `struct _bi_record_${self.name.text} {\n${methodFields.join("\n")}\n};`;
                    // (2) declare the method-accessing functions
                    const methodRetrievers = self.methods.map(methodRef => {
                        const method = result.get(methodRef);
                        const methodType = result.get(method.type);
                        if (methodType.type != "function") {
                            throw "ICE 3009";
                        }
                        const cInstanceParameters = [`struct _bi_record_${self.name.text} main_constraint`].concat(...methodType.generics.map(generic => {
                            const out: string[] = [];
                            for (let constraint of result.get(generic).constraints) {
                                out.push(`struct _bi_record_${result.get(constraint).name.text} gen_${result.get(generic).name.text}_con_${result.get(constraint).name.text}`);
                            }
                            return out;
                        }));
                        const cFormalParameters = methodType.arguments.map((arg, i) => `void* _bv_arg${i}`);
                        let func = `void* bismuth_retrieve_${self.name.text}_${method.name.text}(${["__attribute__((unused)) struct bismuth_function* self"].concat(cInstanceParameters, cFormalParameters).join(", ")})`;
                        func += "{\n";
                        func += "\t";
                        func += `return ((struct bismuth_function*)main_constraint.${method.name.text})->func(main_constraint.${method.name.text}`;
                        for (let genericRef of methodType.generics) {
                            for (let constraintRef of result.get(genericRef).constraints) {
                                func += ", gen_" + result.get(genericRef).name.text + "_con_" + result.get(constraintRef).name.text;
                            }
                        }
                        for (let i = 0; i < methodType.arguments.length; i++) {
                            func += ", _bv_arg" + i;
                        }
                        func += ");";
                        func += ""
                        func += "\n}";
                        
                        let closure = `struct bismuth_function* _bv_${method.name.text};`
                        return func + "\n" + closure;
                    });
                    return instanceRecord + "\n" + methodRetrievers.join("\n");
                },
                initC: (self, result) => {
                    let str = `\n\t// interface ${self.name.text}`;
                    for (let methodRef of self.methods) {
                        const method = result.get(methodRef);
                        str += "\n\t" + "_bv_" + method.name.text + " = make_bismuth_function(" + "bismuth_retrieve_" + self.name.text + "_" + method.name.text + ");";
                        // make_bismuth_function(bismuth_declare_func_main)
                    }
                    return str;
                }
            },
            DeclareInstance: {
                c: (self, result) => {
                    const args: string[] = ([] as string[]).concat(...self.generics.map(generic =>
                        result.get(generic).constraints.map(constraint => "struct _bi_record_" + result.get(constraint).name.text + " req_" + result.get(generic).name.text + "_" + result.get(constraint).name.text)
                    ));
                    let src = `struct _bi_record_${self.name.text} _bi_make_instance_${result.get(self.type).name.text}_iface_${self.name.text}(${args.join(", ")}) {\n`;
                    src += `\tstruct _bi_record_${self.name.text} rec;\n`
                    for (let methodRef of self.methods) {
                        const method = result.get(methodRef);
                        if (method.scale.scale != "instance") {
                            throw `ICE 3238`;
                        }
                        src += `\trec.${method.name.text} = _bv_${method.name.text + "_" + method.scale.unique};\n`;
                    }
                    src += "\treturn rec;\n}";
                    return src;
                },
                preC: (self, result) => {
                    const args: string[] = ([] as string[]).concat(...self.generics.map(generic =>
                        result.get(generic).constraints.map(constraint => "struct _bi_record_" + result.get(constraint).name.text + " req_" + result.get(generic).name.text + "_" + result.get(constraint).name.text)
                    ));
                    return `struct _bi_record_${self.name.text} _bi_make_instance_${result.get(self.type).name.text}_iface_${self.name.text}(${args.join(", ")});`;
                },
            },
            DeclareVar: {
                js: () => `"QUESTION: where is this used?"`,
                c: () => "QUESTION: where is this used?",
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

        let generatedJS = prologueJS;
        function append(x: {js: string}) {
            generatedJS += x.js + "\n\n";
        }
        graphGenerate.each("DeclareStruct", append);
        graphGenerate.each("DeclareEnum", append);
        graphGenerate.each("DeclareInterface", append);
        graphGenerate.each("DeclareFunction", append);
        graphGenerate.each("DeclareMethod", append);

        generatedJS += epilogueJS;
        
        (document.getElementById("generatedJS") as any).innerText = generatedJS;

        const prologueC = `
////////////////////////////////////////////////////////
// BEGIN PRELUDE ///////////////////////////////////////
////////////////////////////////////////////////////////

#include "stdlib.h"
#include "stdio.h"

struct bismuth_function {
    void* (*func)();
};

struct bismuth_int {
    int value;
};

struct bismuth_string {
    char* value;
};

struct bismuth_bool {
    int value;
};

struct bismuth_vector {
    void** items;
    size_t length;
};

struct bismuth_function* make_bismuth_function(void* func()) {
    struct bismuth_function* result = malloc(sizeof(struct bismuth_function));
    result->func = func;
    return result;
}

struct bismuth_int* _make_bismuth_int(int value) {
    struct bismuth_int* result = malloc(sizeof(struct bismuth_int));
    result->value = value;
    return result;
}
struct bismuth_string* _make_bismuth_string(char* value) {
    struct bismuth_string* result = malloc(sizeof(struct bismuth_string));
    result->value = value;
    return result;
}
struct bismuth_bool* _make_bismuth_bool(int value) {
    struct bismuth_bool* result = malloc(sizeof(struct bismuth_bool));
    result->value = value;
    return result;
}
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
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < tail_vector->length; i++) {
        result->items[i+1] = tail_vector->items[i];
    }
    result->items[0] = head;
    return result;
}
void* _make_bismuth_snoc(void* init, void* last) {
    struct bismuth_vector* init_vector = init;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = init_vector->length + 1;
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < init_vector->length; i++) {
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
    printf("%s\\n", ((struct bismuth_string*)line)->value);
    return _make_bismuth_unit();
}
struct bismuth_function* _bv_print;

void* at_declare_builtin(void* self, void* array, void* index) {
    (void)self;
    struct bismuth_vector* vector_array = array;
    struct bismuth_int* int_index = index;
    if (int_index->value < 0 || (size_t)(int_index->value) >= vector_array->length) {
        printf("out-of-bounds index; index %d in array of length %lu\\n", int_index->value, vector_array->length);
        exit(1);
        return 0;
    }
    return vector_array->items[int_index->value];
}
struct bismuth_function* _bv_at;

void* appendArray_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    struct bismuth_vector* first_vector = first;
    struct bismuth_vector* second_vector = second;
    struct bismuth_vector* result = malloc(sizeof(struct bismuth_vector));
    result->length = first_vector->length + second_vector->length;
    result->items = malloc(sizeof(void*) * result->length);
    for (size_t i = 0; i < first_vector->length; i++) {
        result->items[i] = first_vector->items[i];
    }
    for (size_t i = 0; i < second_vector->length; i++) {
        result->items[i+first_vector->length] = second_vector->items[i];
    }
    return result;
}
struct bismuth_function* _bv_appendArray;

void* appendString_declare_builtin(void* self, void* first, void* second) {
    (void)self;
    struct bismuth_string* first_string = first;
    struct bismuth_string* second_string = second;
    struct bismuth_string* result = malloc(sizeof(struct bismuth_string));
    size_t comb_len = 0;
    for (const char* c = first_string->value; *c; ++c) {
        comb_len++;
    }
    for (const char* c = second_string->value; *c; ++c) {
        comb_len++;
    }
    char* str = malloc(comb_len + 1);
    char* o = str;
    for (const char* c = first_string->value; *c; ++c) {
        *o++ = *c;
    }
    for (const char* c = second_string->value; *c; ++c) {
        *o++ = *c;
    }
    *o = 0;
    result->value = str;
    return result;
}
struct bismuth_function* _bv_appendString;

void* length_declare_builtin(void* self, void* array) {
    (void)self;
    struct bismuth_vector* array_vector = array;
    return _make_bismuth_int((int)(array_vector->length));
}
struct bismuth_function* _bv_length;

void* less_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    struct bismuth_int* x_int = x;
    struct bismuth_int* y_int = y;
    return _make_bismuth_bool(x_int->value < y_int->value);
}
struct bismuth_function* _bv_less;

void* add_declare_builtin(void* self, void* x, void* y) {
    (void)self;
    struct bismuth_int* x_int = x;
    struct bismuth_int* y_int = y;
    return _make_bismuth_int(x_int->value + y_int->value);
}
struct bismuth_function* _bv_add;

////////////////////////////////////////////////////////
// BEGIN PROGRAM ///////////////////////////////////////
////////////////////////////////////////////////////////

`;

        const epilogueC = ``;

        let generatedC = prologueC;
        function appendC(x: {c: string}) {
            generatedC += x.c + "\n\n";
        }
        generatedC += "\n\n// SECTION :: STRUCTS\n\n"
        graphGenerate.each("DeclareStruct", appendC);
        generatedC += "\n\n// SECTION :: ENUMS\n\n"
        graphGenerate.each("DeclareEnum", appendC);
        generatedC += "\n\n// SECTION :: INTERFACES\n\n"
        graphGenerate.each("DeclareInterface", appendC);
        generatedC += "\n\n// SECTION :: PRE-FUNCTIONS\n\n"
        graphGenerate.each("DeclareFunction", func => {
            generatedC += "\n" + func.preC + "\n";
        });
        generatedC += "\n\n// SECTION :: PRE-INSTANCES\n\n"
        graphGenerate.each("DeclareInstance", inst => {
            generatedC += "\n" + inst.preC + "\n";
        });
        generatedC += "\n\n// SECTION :: FUNCTIONS\n\n"
        graphGenerate.each("DeclareFunction", appendC);
        generatedC += "\n\n// SECTION :: METHODS\n\n"
        graphGenerate.each("DeclareMethod", appendC);
        generatedC += "\n\n// SECTION :: INSTANCES\n\n"
        graphGenerate.each("DeclareInstance", appendC);
        generatedC += "\n\n// SECTION :: EPILOG\n\n"
        generatedC += epilogueC;

        generatedC += "int main() {";
        graphGenerate.each("DeclareFunction", func => {
            generatedC += "\n\t" + func.initC;
        });
        graphGenerate.each("DeclareInterface", iface => {
            generatedC += "\n\t" + iface.initC;
        });
        generatedC += `\n\n\t// builtins`;
        generatedC += `\n\t_bv_print = make_bismuth_function(print_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_at = make_bismuth_function(at_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_appendArray = make_bismuth_function(appendArray_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_appendString = make_bismuth_function(appendString_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_length = make_bismuth_function(length_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_less = make_bismuth_function(less_declare_builtin); // builtin`;
        generatedC += `\n\t_bv_add = make_bismuth_function(add_declare_builtin); // builtin`;
        generatedC += "\n\n\t// entry point\n\t_bv_main->func();"
        generatedC += "\n}\n";
        
        (document.getElementById("generatedC") as any).innerText = generatedC;
        (document.getElementById("errors") as any).innerText = "";
    } catch (e) {
        (document.getElementById("generatedJS") as any).innerText = "";
        (document.getElementById("generatedC") as any).innerText = "";
        (document.getElementById("errors") as any).innerText = e.message || e;
    }
}
