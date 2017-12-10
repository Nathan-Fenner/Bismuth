

import { Token } from './lex';

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

type DeclareInstance = {
    declare:   "instance",
    interface: Token,
    type:      NamedType,
    generics:  Generic[],
    methods:   DeclareFunction[],
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
    effects: Token[],
    arguments: {name: Token, type: Type}[],
    returns: Type | null,
    body: Block, // allows the 'yield' statement once
}

type Declare = DeclareStruct | DeclareEnum | DeclareFunction | DeclareInterface | DeclareInstance | DeclareEffect | DeclareService;

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
type BorrowType = {
    type: "borrow",
    mutable: boolean,
    reference: Type,
}
type FunctionType = {
    type: "function",
    funcToken: Token,
    generics: Generic[],
    effects: Token[],
    arguments: Type[],
    returns: Type | null,
}

// TODO: consider first-class services

type NeverType = {
    type: "never",
    never: Token,
}

type SelfType = {
    type: "self",
    self: Token,
}

type Type = NamedType | FunctionType | NeverType | SelfType | BorrowType;

//
// Effects
//

// TODO

//
// Statements
//

type VariableStatement = {statement: "var", at: Token, name: Token, type: Type, expression: Expression} // TODO: optional initialization
type AssignStatement = {statement: "assign", at: Token, lhs: Expression, rhs: Expression};
type IfStatement = {statement: "if", at: Token, condition: Expression, thenBlock: Block, elseBlock: Block | null};
type WhileStatement = {statement: "while", at: Token, condition: Expression, bodyBlock: Block};
// TODO: For Statement
type ExpressionStatement = {statement: "expression", at: Token, expression: Expression}; // used for effectful
type ReturnStatement = {statement: "return", at: Token, expression: Expression | null};
type BreakStatement = {statement: "break", at: Token};
type ContinueStatement = {statement: "continue", at: Token};
type YieldStatement = {
    statement: "yield",
    at: Token,
    returns: {result: Token, type: Type, block: Block}, // type must be Self
    actions: {parameters: {name: Token, type: Type}[], block: Block},
}
type SwitchStatement = {
    statement: "switch",
    at: Token,
    expression: Expression,
    branches: {
        pattern: {name: Token, variable: {name: Token, type: Type} | null},
        block: Block,
    }[],
}
type Statement = VariableStatement | AssignStatement | ExpressionStatement | IfStatement | WhileStatement | ReturnStatement | BreakStatement | ContinueStatement | YieldStatement | SwitchStatement;

type Block = {
    at: Token,
    body: Statement[],
}

//
// Expressions
//

type IntegerExpression = {expression: "integer", at: Token, token: Token};
type StringExpression = {expression: "string", at: Token, token: Token};
type BooleanExpression = {expression: "boolean", at: Token, token: Token};
type VariableExpression = {expression: "variable", at: Token, variable: Token};
type DotExpression = {expression: "dot", at: Token, object: Expression, field: Token};
type CallExpression = {expression: "call", at: Token, hasEffect: boolean, function: Expression, arguments: Expression[]};
type ServiceExpression = {expression: "service", at: Token, service: Token, arguments: Expression[], body: Expression}; // discharges or reinterprets effects
type ObjectExpression = {
    expression: "object",
    at: Token,
    name: Token,
    contents: {
        type: "fields",
        fields: {name: Token, value: Expression}[],
    } | {
        type: "empty"
    } | {
        type: "single",
        value: Expression,
    },
};
type ArrayExpression = {expression: "array", at: Token, name: Token | null, items: Expression[]};
// TODO: map expression
type OperatorExpression = {expression: "operator", at: Token, operator: Token, left: Expression, right: Expression};
type PrefixExpression = {expression: "prefix", at: Token, operator: Token, right: Expression};
// TODO: briefer lambdas + void
type FunctionExpression = {expression: "function", at: Token, generics: Generic[], arguments: {name: Token, type: Type}[], returns: Type, body: Block}
type BorrowExpression = {expression: "borrow", at: Token, mutable: boolean, reference: Expression};
type ForeignExpression = {expression: "foreign", at: Token}

type Expression = IntegerExpression | StringExpression | BooleanExpression | VariableExpression | DotExpression | CallExpression | OperatorExpression | PrefixExpression | ServiceExpression | ObjectExpression | ArrayExpression | FunctionExpression | BorrowExpression | ForeignExpression;

export {
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
    BorrowType,
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
    BorrowExpression,
    ForeignExpression,
    Expression,
};
