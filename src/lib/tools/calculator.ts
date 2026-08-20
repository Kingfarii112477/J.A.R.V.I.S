/**
 * A hand-rolled recursive-descent arithmetic evaluator — deliberately NOT
 * `eval()` or `new Function()`. Only digits, `+ - * / ^ ( )`, and
 * whitespace are accepted; anything else is rejected before evaluation
 * ever starts, so there is no code-execution surface here at all.
 */
export class CalculatorError extends Error {}

function tokenize(expr: string): string[] {
  const tokenPattern = /\s*([0-9]*\.?[0-9]+|[+\-*/^()])\s*/y;
  const tokens: string[] = [];
  let index = 0;
  while (index < expr.length) {
    tokenPattern.lastIndex = index;
    const match = tokenPattern.exec(expr);
    if (!match || match[0].length === 0) {
      throw new CalculatorError(`Unsupported character at position ${index}: "${expr[index]}".`);
    }
    tokens.push(match[1]);
    index += match[0].length;
  }
  return tokens;
}

export function evaluateExpression(expr: string): number {
  if (expr.length > 200) throw new CalculatorError("Expression too long.");
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new CalculatorError("Empty expression.");
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const rhs = parseUnary();
      if (op === "/") {
        if (rhs === 0) throw new CalculatorError("Division by zero.");
        value = value / rhs;
      } else {
        value = value * rhs;
      }
    }
    return value;
  }

  function parseUnary(): number {
    if (peek() === "-") {
      consume();
      return -parseUnary();
    }
    if (peek() === "+") {
      consume();
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePrimary();
    if (peek() === "^") {
      consume();
      const exponent = parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary(): number {
    const token = consume();
    if (token === undefined) throw new CalculatorError("Unexpected end of expression.");
    if (token === "(") {
      const value = parseExpression();
      if (consume() !== ")") throw new CalculatorError("Missing closing parenthesis.");
      return value;
    }
    const num = Number(token);
    if (Number.isNaN(num)) throw new CalculatorError(`Unexpected token "${token}".`);
    return num;
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new CalculatorError(`Unexpected trailing input near "${tokens[pos]}".`);
  if (!Number.isFinite(result)) throw new CalculatorError("Result is not a finite number.");
  return result;
}
