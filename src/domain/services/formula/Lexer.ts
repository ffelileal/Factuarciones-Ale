export type TokenType =
  | 'NUMBER'
  | 'IDENTIFIER' 
  | 'OPERATOR'   
  | 'LPAREN'     
  | 'RPAREN'     
  | 'COMMA'      
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
}

export class Lexer {
  private readonly input: string;
  private position: number = 0;

  public constructor(input: string) {
    this.input = input;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.position < this.input.length) {
      const char = this.input[this.position];

      if (/\s/.test(char)) {
        this.position++;
        continue;
      }

      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        this.position++;
        continue;
      }

      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        this.position++;
        continue;
      }

      if (char === ',') {
        tokens.push({ type: 'COMMA', value: ',' });
        this.position++;
        continue;
      }

      // Operadores de múltiples caracteres: >=, <=, ==, !=, &&, ||
      if (this.matchAhead('&&')) {
        tokens.push({ type: 'OPERATOR', value: '&&' });
        this.position += 2;
        continue;
      }
      if (this.matchAhead('||')) {
        tokens.push({ type: 'OPERATOR', value: '||' });
        this.position += 2;
        continue;
      }
      if (this.matchAhead('==')) {
        tokens.push({ type: 'OPERATOR', value: '==' });
        this.position += 2;
        continue;
      }
      if (this.matchAhead('!=')) {
        tokens.push({ type: 'OPERATOR', value: '!=' });
        this.position += 2;
        continue;
      }
      if (this.matchAhead('>=')) {
        tokens.push({ type: 'OPERATOR', value: '>=' });
        this.position += 2;
        continue;
      }
      if (this.matchAhead('<=')) {
        tokens.push({ type: 'OPERATOR', value: '<=' });
        this.position += 2;
        continue;
      }

      // Operadores de un caracter: +, -, *, /, >, <, !
      if ('+-*/><!'.includes(char)) {
        tokens.push({ type: 'OPERATOR', value: char });
        this.position++;
        continue;
      }

      // Números decimales
      if (/\d/.test(char) || (char === '.' && /\d/.test(this.input[this.position + 1] || ''))) {
        let value = '';
        let hasDot = false;
        while (this.position < this.input.length) {
          const c = this.input[this.position];
          if (/\d/.test(c)) {
            value += c;
          } else if (c === '.' && !hasDot) {
            hasDot = true;
            value += c;
          } else {
            break;
          }
          this.position++;
        }
        tokens.push({ type: 'NUMBER', value });
        continue;
      }

      // Identificadores (variables y funciones)
      if (/[a-zA-Z_]/.test(char)) {
        let value = '';
        while (this.position < this.input.length) {
          const c = this.input[this.position];
          if (/[a-zA-Z0-9_]/.test(c)) {
            value += c;
          } else {
            break;
          }
          this.position++;
        }
        tokens.push({ type: 'IDENTIFIER', value });
        continue;
      }

      throw new Error(`Carácter inesperado en la fórmula: '${char}' en posición ${this.position}`);
    }

    tokens.push({ type: 'EOF', value: '' });
    return tokens;
  }

  private matchAhead(str: string): boolean {
    return this.input.substring(this.position, this.position + str.length) === str;
  }
}
