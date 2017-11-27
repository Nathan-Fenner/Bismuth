

type ObjHas<Obj, K extends string> = ({[K in keyof Obj]: '1' } & { [k: string]: '0' })[K];
type IfObjHas<Obj, K extends string, Yes, No = never> = ({[K in keyof Obj]: Yes } & { [k: string]: No })[K];
type Overwrite<K, T> = {[P in keyof T | keyof K]: { 1: T[P], 0: K[P] }[ObjHas<T, P>]};
type Diff<T extends string, U extends string> = ({ [P in T]: P } & { [P in U]: never } & { [x: string]: never })[T];
type Omit<T, K extends keyof T> = Pick<T, Diff<keyof T, K>>;

let uniqueCount = 0;
function unique(): string {
    return "U" + (uniqueCount++);
}

export {
    ObjHas,
    IfObjHas,
    Overwrite,
    Diff,
    Omit,
    unique,
};
