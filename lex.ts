
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
    let locationByCharacter: string[] = [];
    {
        let line = 1;
        let column = 1;
        for (let i = 0; i < source.length; i++) {
            locationByCharacter[i] = `line ${line}:${column}`;
            if (source[i] == "\r") {
                column = 1;
            } else if (source[i] == "\n") {
                column = 1;
                line++;
            } else if (source[i] == "\t") {
                column += 4;
            } else {
                column++;
            }
        }
        locationByCharacter.push("end of file");
    }
    let result: Token[] = [];
    let start = 0;
    let rules: {[n: string]: RegExp} = {
        integer: /^[0-9]+/,
        name: /^[a-zA-Z_][a-zA-Z_0-9]*/,
        whitespace: /^\s+/,
        comment: /^\/\/[^\n]*/,
        string: new RegExp(`^"([^"]|\\\\")*"`),
        special: /^[()\]\[.,;:&#|{}!]/,
        operator: /^[+\-*/=<>?%^~]+/,
        foreign: /^foreign#[^#]*#/,
    };
    let special = ["func", "foreign", "mut", "discard", "true", "false", "self", "never", "interface", "instance", "struct", "enum", "switch", "of", "case", "yield", "is", "and", "or", "if", "while", "var", "for", "else", "service", "effect", "return", "break", "continue"];
    while (start < source.length) {
        let next: null | Token = null;
        for (let tokenType in rules) {
            let match = source.substr(start).match(rules[tokenType]);
            if (!match) {
                continue;
            }
            if (!next || next.text.length < match[0].length) {
                next = {text: match[0], type: tokenType, location: locationByCharacter[start]};
            }
        }
        if (!next) {
            return new ParseError(`unknown token at character ${start}`);
        }
        start += next.text.length;
        if (special.indexOf(next.text) >= 0) {
            next.type = "special";
        }
        result.push(next);
    }
    result.push({text: "", type: "end", location: "end of script"});
    return result.filter(token => ["comment", "whitespace"].indexOf(token.type) < 0);
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

type TokenSelector = string;

function selectsToken(selector: string, token: Token): boolean {
    if (selector.charAt(0) == "$") {
        return token.type == selector.substr(1);
    } else {
        return token.text == selector;
    }
}

export {
    Token,
    TokenStream,
    lex,
    showToken,
    ParseError,
    TokenSelector,
    selectsToken,
}
