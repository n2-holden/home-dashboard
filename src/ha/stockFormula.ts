/**
 * Tiny arithmetic parser for calculated ticker values, e.g.
 * `9*TECL + 3*IBIT + 4.5 * SPXL`. Supports + - * / parentheses, unary minus,
 * numbers and ticker symbols (letters, digits, `.`, `^`, `=`; no `-`, which is minus).
 */

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'sym'; symbol: string }
  | { kind: 'neg'; arg: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }

type Token = { type: 'num'; value: number } | { type: 'sym'; value: string } | { type: 'op'; value: string }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i += 1
    } else if (/[0-9.]/.test(ch)) {
      const m = /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(input.slice(i))
      if (!m) throw new Error(`Unexpected "${ch}"`)
      tokens.push({ type: 'num', value: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z^]/.test(ch)) {
      const m = /^\^?[A-Za-z][A-Za-z0-9.=]*/.exec(input.slice(i))
      if (!m) throw new Error(`Unexpected "${ch}"`)
      tokens.push({ type: 'sym', value: m[0].toUpperCase() })
      i += m[0].length
    } else if ('+-*/()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i += 1
    } else {
      throw new Error(`Unexpected "${ch}"`)
    }
  }
  return tokens
}

export function parseStockFormula(input: string): Node {
  const tokens = tokenize(input)
  if (tokens.length === 0) throw new Error('Formula is empty')
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (value: string) => peek()?.type === 'op' && peek()?.value === value

  const primary = (): Node => {
    const token = peek()
    if (!token) throw new Error('Formula ends too early')
    if (token.type === 'num') {
      pos += 1
      return { kind: 'num', value: token.value }
    }
    if (token.type === 'sym') {
      pos += 1
      return { kind: 'sym', symbol: token.value }
    }
    if (token.value === '(') {
      pos += 1
      const inner = expr()
      if (!isOp(')')) throw new Error('Missing ")"')
      pos += 1
      return inner
    }
    if (token.value === '-') {
      pos += 1
      return { kind: 'neg', arg: primary() }
    }
    if (token.value === '+') {
      pos += 1
      return primary()
    }
    throw new Error(`Unexpected "${token.value}"`)
  }
  const term = (): Node => {
    let node = primary()
    while (isOp('*') || isOp('/')) {
      const op = peek().value as '*' | '/'
      pos += 1
      node = { kind: 'bin', op, left: node, right: primary() }
    }
    return node
  }
  const expr = (): Node => {
    let node = term()
    while (isOp('+') || isOp('-')) {
      const op = peek().value as '+' | '-'
      pos += 1
      node = { kind: 'bin', op, left: node, right: term() }
    }
    return node
  }

  const tree = expr()
  if (pos < tokens.length) throw new Error(`Unexpected "${String(peek().value)}"`)
  return tree
}

export function stockFormulaSymbols(node: Node, out: string[] = []): string[] {
  if (node.kind === 'sym') {
    if (!out.includes(node.symbol)) out.push(node.symbol)
  } else if (node.kind === 'neg') {
    stockFormulaSymbols(node.arg, out)
  } else if (node.kind === 'bin') {
    stockFormulaSymbols(node.left, out)
    stockFormulaSymbols(node.right, out)
  }
  return out
}

/** Returns null when any referenced symbol has no value or the result is not finite. */
export function evaluateStockFormula(
  node: Node,
  valueOf: (symbol: string) => number | null | undefined,
): number | null {
  const run = (n: Node): number | null => {
    switch (n.kind) {
      case 'num':
        return n.value
      case 'sym': {
        const v = valueOf(n.symbol)
        return typeof v === 'number' && Number.isFinite(v) ? v : null
      }
      case 'neg': {
        const v = run(n.arg)
        return v == null ? null : -v
      }
      case 'bin': {
        const a = run(n.left)
        const b = run(n.right)
        if (a == null || b == null) return null
        if (n.op === '+') return a + b
        if (n.op === '-') return a - b
        if (n.op === '*') return a * b
        return b === 0 ? null : a / b
      }
    }
  }
  const result = run(node)
  return result != null && Number.isFinite(result) ? result : null
}

/** Human-readable problem with a formula, or null when it parses. */
export function stockFormulaError(input: string): string | null {
  try {
    const tree = parseStockFormula(input)
    if (stockFormulaSymbols(tree).length === 0) return 'Formula needs at least one stock symbol'
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid formula'
  }
}
