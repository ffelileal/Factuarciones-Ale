import { Lexer } from './Lexer';
import { Parser, ASTNode } from './Parser';
import { Decimal } from 'decimal.js';

export class ASTCache {
  private static cache = new Map<string, ASTNode>();

  public static get(formula: string): ASTNode | null {
    return this.cache.get(formula) || null;
  }

  public static set(formula: string, ast: ASTNode): void {
    this.cache.set(formula, ast);
  }

  public static clear(): void {
    this.cache.clear();
  }
}

export class FormulaEvaluator {
  public static evaluate(formula: string, context: Map<string, any>): Decimal | boolean {
    const trimmed = formula.trim();
    if (!trimmed) {
      return new Decimal(0);
    }

    let ast = ASTCache.get(trimmed);
    if (!ast) {
      const lexer = new Lexer(trimmed);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      ast = parser.parse();
      ASTCache.set(trimmed, ast);
    }

    return ast.evaluate(context);
  }
}
