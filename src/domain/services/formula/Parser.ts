import { Token, TokenType } from './Lexer';
import { Decimal } from 'decimal.js';

export interface ASTNode {
  evaluate(context: Map<string, any>): any;
}

export class LiteralNode implements ASTNode {
  public constructor(private readonly value: Decimal | boolean) {}
  public evaluate(): any {
    return this.value;
  }
}

export class VariableNode implements ASTNode {
  public constructor(private readonly name: string) {}
  public evaluate(context: Map<string, any>): any {
    if (!context.has(this.name)) {
      // Default to 0 if variable is missing to prevent breaking calculations, but log or check
      return new Decimal(0);
    }
    const val = context.get(this.name);
    if (typeof val === 'boolean') return val;
    return new Decimal(val);
  }
}

export class UnaryOpNode implements ASTNode {
  public constructor(
    private readonly operator: string,
    private readonly operand: ASTNode
  ) {}

  public evaluate(context: Map<string, any>): any {
    const val = this.operand.evaluate(context);
    if (this.operator === '!') {
      return !val;
    }
    if (this.operator === '-') {
      return (val as Decimal).negated();
    }
    throw new Error(`Operador unario no soportado: '${this.operator}'`);
  }
}

export class BinaryOpNode implements ASTNode {
  public constructor(
    private readonly operator: string,
    private readonly left: ASTNode,
    private readonly right: ASTNode
  ) {}

  public evaluate(context: Map<string, any>): any {
    const leftVal = this.left.evaluate(context);
    
    // Lazy evaluation for logical operators
    if (this.operator === '&&') {
      return leftVal && this.right.evaluate(context);
    }
    if (this.operator === '||') {
      return leftVal || this.right.evaluate(context);
    }

    const rightVal = this.right.evaluate(context);

    switch (this.operator) {
      case '+': return (leftVal as Decimal).plus(rightVal as Decimal);
      case '-': return (leftVal as Decimal).minus(rightVal as Decimal);
      case '*': return (leftVal as Decimal).times(rightVal as Decimal);
      case '/': 
        if ((rightVal as Decimal).isZero()) throw new Error("División por cero en fórmula.");
        return (leftVal as Decimal).dividedBy(rightVal as Decimal);
      case '==': 
        if (leftVal instanceof Decimal && rightVal instanceof Decimal) {
          return leftVal.equals(rightVal);
        }
        return leftVal === rightVal;
      case '!=': 
        if (leftVal instanceof Decimal && rightVal instanceof Decimal) {
          return !leftVal.equals(rightVal);
        }
        return leftVal !== rightVal;
      case '>': return (leftVal as Decimal).greaterThan(rightVal as Decimal);
      case '<': return (leftVal as Decimal).lessThan(rightVal as Decimal);
      case '>=': return (leftVal as Decimal).greaterThanOrEqualTo(rightVal as Decimal);
      case '<=': return (leftVal as Decimal).lessThanOrEqualTo(rightVal as Decimal);
      default:
        throw new Error(`Operador binario no soportado: '${this.operator}'`);
    }
  }
}

export class FunctionNode implements ASTNode {
  public constructor(
    private readonly name: string,
    private readonly args: ASTNode[]
  ) {}

  public evaluate(context: Map<string, any>): any {
    const evaluatedArgs = this.args.map(arg => arg.evaluate(context));

    switch (this.name.toUpperCase()) {
      case 'IF':
        if (this.args.length !== 3) throw new Error("La función 'IF' requiere exactamente 3 argumentos.");
        const cond = this.args[0].evaluate(context);
        return cond ? this.args[1].evaluate(context) : this.args[2].evaluate(context);
      
      case 'ROUND':
        if (evaluatedArgs.length < 1 || evaluatedArgs.length > 2) {
          throw new Error("La función 'ROUND' requiere 1 o 2 argumentos.");
        }
        const val = evaluatedArgs[0] as Decimal;
        const decimals = evaluatedArgs[1] ? (evaluatedArgs[1] as Decimal).toNumber() : 2;
        return val.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
      
      case 'MAX':
        if (evaluatedArgs.length < 1) throw new Error("La función 'MAX' requiere al menos 1 argumento.");
        return Decimal.max(...(evaluatedArgs as Decimal[]));
      
      case 'MIN':
        if (evaluatedArgs.length < 1) throw new Error("La función 'MIN' requiere al menos 1 argumento.");
        return Decimal.min(...(evaluatedArgs as Decimal[]));

      case 'FLOOR':
        if (evaluatedArgs.length !== 1) throw new Error("La función 'FLOOR' requiere exactamente 1 argumento.");
        return (evaluatedArgs[0] as Decimal).floor();

      case 'CEIL':
        if (evaluatedArgs.length !== 1) throw new Error("La función 'CEIL' requiere exactamente 1 argumento.");
        return (evaluatedArgs[0] as Decimal).ceil();

      case 'ABS':
        if (evaluatedArgs.length !== 1) throw new Error("La función 'ABS' requiere exactamente 1 argumento.");
        return (evaluatedArgs[0] as Decimal).abs();

      case 'SWITCH':
        if (evaluatedArgs.length < 4 || evaluatedArgs.length % 2 !== 0) {
          throw new Error("La función 'SWITCH' requiere un valor de control, al menos un par (caso, resultado) y un valor por defecto.");
        }
        const control = evaluatedArgs[0];
        // Loop through pairs: (i=1; i<len-1; i+=2)
        for (let i = 1; i < evaluatedArgs.length - 1; i += 2) {
          const matchCase = evaluatedArgs[i];
          if (control instanceof Decimal && matchCase instanceof Decimal) {
            if (control.equals(matchCase)) return evaluatedArgs[i + 1];
          } else if (control === matchCase) {
            return evaluatedArgs[i + 1];
          }
        }
        // Return default argument (last one)
        return evaluatedArgs[evaluatedArgs.length - 1];

      case 'SUM':
        if (evaluatedArgs.length < 1) throw new Error("La función 'SUM' requiere al menos 1 argumento.");
        return (evaluatedArgs as Decimal[]).reduce((acc, curr) => acc.plus(curr), new Decimal(0));

      default:
        throw new Error(`Función desconocida: '${this.name}'`);
    }
  }
}

export class Parser {
  private readonly tokens: Token[];
  private current: number = 0;

  public constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): ASTNode {
    const node = this.logicalOr();
    if (!this.isAtEnd()) {
      throw new Error(`Token inesperado al final de la fórmula: '${this.peek().value}'`);
    }
    return node;
  }

  // Precedencia 1: ||
  private logicalOr(): ASTNode {
    let node = this.logicalAnd();
    while (this.match('||')) {
      const operator = this.previous().value;
      const right = this.logicalAnd();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 2: &&
  private logicalAnd(): ASTNode {
    let node = this.equality();
    while (this.match('&&')) {
      const operator = this.previous().value;
      const right = this.equality();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 3: ==, !=
  private equality(): ASTNode {
    let node = this.comparison();
    while (this.match('==', '!=')) {
      const operator = this.previous().value;
      const right = this.comparison();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 4: <, <=, >, >=
  private comparison(): ASTNode {
    let node = this.term();
    while (this.match('<', '<=', '>', '>=')) {
      const operator = this.previous().value;
      const right = this.term();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 5: +, -
  private term(): ASTNode {
    let node = this.factor();
    while (this.match('+', '-')) {
      const operator = this.previous().value;
      const right = this.factor();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 6: *, /
  private factor(): ASTNode {
    let node = this.unary();
    while (this.match('*', '/')) {
      const operator = this.previous().value;
      const right = this.unary();
      node = new BinaryOpNode(operator, node, right);
    }
    return node;
  }

  // Precedencia 7: !, - (unary)
  private unary(): ASTNode {
    if (this.match('!', '-')) {
      const operator = this.previous().value;
      const right = this.unary();
      return new UnaryOpNode(operator, right);
    }
    return this.primary();
  }

  // Precedencia 8: Literales, Variables, Paréntesis, Funciones
  private primary(): ASTNode {
    if (this.match('NUMBER')) {
      return new LiteralNode(new Decimal(this.previous().value));
    }

    if (this.match('IDENTIFIER')) {
      const name = this.previous().value;

      // Check if it's a function call: IDENTIFIER '('
      if (this.match('LPAREN')) {
        const args: ASTNode[] = [];
        if (!this.check('RPAREN')) {
          do {
            args.push(this.logicalOr());
          } while (this.match('COMMA'));
        }
        this.consume('RPAREN', "Se esperaba ')' al finalizar los argumentos de la función.");
        return new FunctionNode(name, args);
      }

      // Check for boolean literals
      if (name.toLowerCase() === 'true') return new LiteralNode(true);
      if (name.toLowerCase() === 'false') return new LiteralNode(false);

      // Normal variable
      return new VariableNode(name);
    }

    if (this.match('LPAREN')) {
      const node = this.logicalOr();
      this.consume('RPAREN', "Se esperaba ')' para cerrar el paréntesis.");
      return node;
    }

    throw new Error(`Se esperaba una expresión válida. Token actual: '${this.peek().value}'`);
  }

  private match(...types: string[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    // Overload checks to check either TokenType or the literal operator value
    const peeked = this.peek();
    return peeked.type === type || peeked.value === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: string, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(message);
  }
}
