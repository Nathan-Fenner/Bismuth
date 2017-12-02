
// The intermediate representation is a small language corresponding to C.
// Its type system supports additional features not available in C; but
// these do not affect runtime behavior (types are erased, not reified).

// The language is statement-oriented, rather than expression-oriented.

namespace C {

    let id = 1000;
    function temporary(): string {
        return "r" + (++id);
    }

    // Things that happen in generated code:
    // x = y;
    // x = 7;
    // x = f(y);
    // x = (*fp)(y);
    // x = y->f;
    // p->f = y;
    // p = malloc(sizeof(T))

    export class Register {
        constructor(public readonly name: string = "") {
            this.name = this.name.replace(/[^a-zA-Z]/g, "_");
            this.name = temporary() + (name ? "_" + name : "");
        }
        static foreignName(name: string): Register {
            let r = new Register();
            (r as any).name = name;
            return r;
        }
        isRegister() {}
    }

    export abstract class Computation {
        constructor() {}
        abstract renderCode(): {code: string, target: Register};
    }

    export class Copy extends Computation {
        constructor(
            public readonly source: Register,
        ) {
            super();
        }
        renderCode() {
            const target = new Register();
            return {code: `void* ${target.name} = ${this.source.name};`, target};
        }
    }

    export class Load extends Computation {
        constructor(
            public readonly constant: string,
        ){
            super();
        }
        renderCode() {
            const target = new Register();
            return {code: `void* ${target.name} = ${this.constant};`, target};
        }
    }

    export class CallStatic extends Computation {
        constructor(
            public readonly name: string,
            public readonly parameters: Computation[],
        ) {
            super();
        }
        renderCode() {
            const target = new Register();
            const code = this.parameters.map(c => c.renderCode());
            return {
                code: code.map(c => c.code).join("\n") + "\n" + "void * " + target.name + " = " +  `${this.name}(${code.map(r => r.target.name).join(", ")});`,
                target,
            };
        }
    }

    export class CallDynamic extends Computation {
        constructor(
            public readonly object: Computation,
            public readonly struct: string,
            public readonly field: string,
            public readonly parameters: Computation[],
        ) {
            super();
        }
        renderCode() {
            const target = new Register();
            const code = this.parameters.map(c => c.renderCode());
            const objectCode = this.object.renderCode();
            return {
                code: code.map(c => c.code).join("\n") + "\n" + objectCode.code + "\n" + "void* " + target.name + " = " +  `((struct ${this.struct}*)${objectCode.target.name})->${this.field}(${code.map(r => r.target.name).join(", ")});`,
                target,
            };
        }
    }

    export class FieldRead extends Computation {
        constructor(
            public readonly source: Computation,
            public readonly struct: string,
            public readonly field: string,
        ) {
            super();
        }
        renderCode() {
            const target = new Register();
            let gen = this.source.renderCode();
            return {code: gen.code + "\n" + `void* ${target.name} = ((struct ${this.struct}*)${gen.target.name})->${this.field};`, target};
        }
    }

    export class Allocate extends Computation {
        constructor(
            public readonly struct: string,
            public readonly fields: {readonly [name: string]: Computation},
        ) {
            super();
        }
        renderCode() {
            const target = new Register();
            const rendered: {[p: string]: {code: string, target: Register}} = {};
            for (let p in this.fields) {
                rendered[p] = this.fields[p].renderCode();
            }
            let code = `struct ${this.struct}* ${target.name} = malloc(sizeof(struct ${this.struct}));`;
            for (let field in rendered) {
                code += "\n" + rendered[field].code;
                code += "\n" + `${target.name}->${field} = ${rendered[field].target.name};`
            }
            return {code, target};
        }
    }

    export function indentBodyString(x: string): string {
        return ("\n" + x).replace(/\n/g, "\n\t");
    }

    export abstract class Statement {
        abstract renderStatement(): string;
    }

    export class Assignment extends Statement {
        constructor(
            public readonly target: Register,
            public readonly source: Computation,
        ) {
            super();
        }
        renderStatement() {
            const rendered = this.source.renderCode();
            return `${rendered.code}\n${this.target.name} = ${rendered.target.name};`;
        }
    }
    export class Execute extends Statement {
        constructor(
            public readonly source: Computation,
        ) {
            super();
        }
        renderStatement() {
            const rendered = this.source.renderCode();
            return rendered.code + "\n" + "(void)" + rendered.target.name + ";";
        }
    }
    export class Local extends Statement {
        constructor(
            public readonly register: Register,
            public readonly source: Computation,
        ) {
            super();
        }
        renderStatement() {
            const rendered = this.source.renderCode();
            return `${rendered.code}\nvoid* ${this.register.name} = ${rendered.target.name};`;
        }
    }
    export class ConditionBlock extends Statement {
        constructor(
            public readonly condition: Computation,
            public readonly bodyTrue: Block,
            public readonly bodyFalse: Block,
        ) {
            super();
        }
        renderStatement() {
            let generated = this.condition.renderCode();
            const codeTrue = this.bodyTrue.renderBlock();
            const codeFalse = this.bodyFalse.renderBlock();
            if (codeFalse == "{\n}") {
                return generated.code + "\n" + `if (${generated.target.name}) ${codeTrue}`;
            }
            return generated.code + "\n" + `if (${generated.target.name}) ${codeTrue} else ${codeFalse}`;
        }
    }

    export class Loop extends Statement {
        constructor(public readonly body: Block) {
            super();
        }
        renderStatement() {
            return `while(1) ${indentBodyString(this.body.renderBlock())}`;
        }
    }

    export class Break extends Statement {
        constructor() {
            super();
        }
        renderStatement() {
            return "break;";
        }
    }
    export class Continue extends Statement {
        constructor() {
            super();
        }
        renderStatement() {
            return "continue;";
        }
    }

    export class Return extends Statement {
        constructor(
            public readonly source: null | Computation,
        ) {
            super();
        }
        renderStatement() {
            if (this.source) {
                const code = this.source.renderCode();
                return `${code.code}\nreturn ${code.target.name};`
            }
            return `return;`;
        }
    }

    export class Empty extends Statement {
        constructor() {
            super();
        }
        renderStatement() {
            return "//nothing";
        }
    }
    
    export class DoBlock extends Statement {
        constructor(public readonly block: Block) {
            super();
        }
        renderStatement() {
            return this.block.renderBlock();
        }
    }

    export class Block {
        constructor(
            public readonly statements: Statement[]
        ) {}
        renderBlock() {
            if (this.statements.length == 0) {
                return "{\n}";
            }
            return "{\n" + indentBodyString(this.statements.map(s => s.renderStatement()).join("\n")) + "\n}";
        }
    }

    export abstract class Declaration {
        abstract predeclare(): string;
        abstract declare(): {in: "main", code: string} | {in: "static", code: string} | null;
    }

    export class Struct extends Declaration {
        constructor(
            public readonly name: string,
            public readonly fields: (string | {custom: string})[], // default is void*
        ) {
            super();
        }
        predeclare() {
            let code = "struct " + this.name + "{";
            for (let field of this.fields) {
                if (typeof field == "string") {
                    code += "\n\tvoid* " + field + ";";
                } else {
                    code += "\n\t" + field.custom + ";";
                }
            }
            code += "\n};";
            return code;
        }
        declare() {
            return null;
        }
    }

    export class Func extends Declaration {
        constructor(
            public readonly name: string,
            public readonly parameters: Register[],
            public readonly code: Block,
        ) {
            super();
        }
        predeclare(): string {
            return "void* " + this.name + "(" + this.parameters.map(n => "void* " + n.name).join(", ") + ");";
        }
        declare(): {in: "static", code: string} {
            return {
                in: "static",
                code: "void* " + this.name + "(" + this.parameters.map(n => "void* " + n.name).join(", ") + ") " + new Block([new DoBlock(this.code), new Return(new Load("0"))]).renderBlock(),
            };
        }
    }

    export class Global extends Declaration {
        constructor(
            public readonly name: Register,
            public readonly compute: Computation,
            public readonly type: string,
        ) {
            super();
        }
        predeclare(): string {
            return this.type + " " + this.name.name + ";";
        }
        declare(): {in: "main", code: string} {
            return {
                in: "main",
                code: new Assignment(this.name, this.compute).renderStatement(),
            };
        }
    }
}