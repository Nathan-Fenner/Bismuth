
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Graph                                                                                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////

import {unique} from './utility'

class Ref<Type extends string> {
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
    in<T>(g: GraphOf<{[n in Type]: T}>): T {
        return g.get(this);
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

class Link<Parent extends string, Child> {
    constructor(public readonly make: (parent: Ref<Parent>) => Child) {
    }
}

function link<Parent extends string, Child>(make: (parent: Ref<Parent>) => Child): Link<Parent, Child> {
    return new Link(make);
}

class GraphOf<Shape> {
    public readonly shapeType: Shape = null as any;
    constructor(private readonly nodes: {
        [Variety in keyof Shape]: {
            [id: string]: Shape[Variety],
        }
    }) {}
    declare<New>(extra: keyof New): Shape & New {
        const nodes: any = {};
        Object.assign(nodes, this.nodes);
        nodes[extra] = {};
        return new GraphOf(nodes) as any;
    }
    insert<Variety extends keyof Shape>(insertVariety: Variety, properties: {[F in keyof Shape[Variety]]: Shape[Variety][F] | Link<Variety, Shape[Variety][F]>}): Ref<Variety> {
        let newId = unique();
        let self = new Ref(insertVariety, newId);
        this.nodes[insertVariety][newId] = {} as any;
        for (let property in properties) {
            if (typeof properties[property] == "object" && properties[property] != null && ("$new" in properties[property])) {
                // see second pass
            } else {
                const assignFrom = properties[property];
                if (assignFrom instanceof Link) {
                    this.nodes[insertVariety][newId][property] = assignFrom.make(self);
                } else {
                    this.nodes[insertVariety][newId][property] = assignFrom as any; // NOTE: exploiting hole
                }
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
    compute<Extra>(generators: {[Variety in keyof Extra]: { [Key in keyof Extra[Variety]]: (self: (Shape&Extra)[Variety], result: GraphOf<Shape&Extra>, selfRef: Ref<Variety>) => Extra[Variety][Key] } }): GraphOf<Shape & Extra> {
        let result: GraphOf<Shape & Extra> = new GraphOf({} as any);
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
                    // Note: the following fails to type check, for some reason, without the 'any' casts.
                    let value = (result as any).nodes[variety][id][newProperty];
                    delete (result as any).nodes[variety][id][newProperty];
                    (result as any).nodes[variety][id][newProperty] = value;
                }
            }
        }
        return result;
    }
    ignoreFields<S2 extends Shape>(): GraphOf<S2> {
        return this as any;
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

export {
    Lazy,
    Ref,
    GraphOf,
    link,
}