
let globalDefineMap = {}

function define(name, requirements, generator) {
    globalDefineMap.exports = {};
    let args = [];
    for (let name of requirements) {
        args.push(globalDefineMap[name]);
    }
    generator(...args);
    globalDefineMap[name] = globalDefineMap.exports;
}

function obtain(name) {
    return globalDefineMap[name];
}