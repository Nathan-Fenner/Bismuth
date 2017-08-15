# Bismuth

Bismuth is a functional language with an imperative flavor and strong, static-typing.

```
func main!IO() {
    print!("Hello, world!");
}

func map[A, B](f: func(A) -> B, xs: Array[A]) -> Array[B] {
    result: Array[B] = #[];
    for var i: Index in xs.iter() {
        result.push(f(xs[i]));
    }
    return result;
}

struct Vector {
    var x: Float64;
    var y: Float64;
}

enum Option[T] {
    case None;
    case Some < T; // TODO: better syntax
}
```

The transpiler itself is a work-in-progress.
Bismuth will initially target JavaScript and C.

