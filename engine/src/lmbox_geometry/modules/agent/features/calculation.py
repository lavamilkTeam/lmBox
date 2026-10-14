"""A bounded arithmetic evaluator, with no Python eval or executable syntax."""

import ast
import math
import operator

from lmbox_geometry.contracts.ai import AiError

_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}


def calculate(expression):
    if not isinstance(expression, str) or not 1 <= len(expression) <= 512:
        raise AiError("invalid_tool_input", "Calculation must contain 1 to 512 characters.")
    try:
        tree = ast.parse(expression, mode="eval")
        if sum(1 for _ in ast.walk(tree)) > 128:
            raise ValueError()

        def evaluate(node, depth=0):
            if depth > 24:
                raise ValueError()
            if isinstance(node, ast.Constant) and type(node.value) in (int, float):
                value = node.value
            elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
                value = evaluate(node.operand, depth + 1)
                if isinstance(node.op, ast.USub):
                    value = -value
            elif isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
                left = evaluate(node.left, depth + 1)
                right = evaluate(node.right, depth + 1)
                if isinstance(node.op, ast.Pow) and abs(right) > 16:
                    raise ValueError()
                value = _OPERATORS[type(node.op)](left, right)
            else:
                raise ValueError()
            if (
                not isinstance(value, (int, float))
                or not math.isfinite(value)
                or abs(value) > 1e100
            ):
                raise ValueError()
            return value

        return evaluate(tree.body)
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError, TypeError):
        raise AiError(
            "invalid_tool_input", "Only bounded finite arithmetic is supported."
        ) from None
