"""Keep LangGraph objects behind the application boundary."""

import sys
from typing import TypedDict

from lmbox_geometry.contracts.ai import AiError


class _State(TypedDict):
    messages: list
    steps: int


def require_graph():
    if sys.version_info < (3, 10):
        raise AiError("dependency_missing", "Agent execution requires Python 3.10 or newer.")
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError:
        raise AiError(
            "dependency_missing", "Install the engine AI extra to enable LangGraph."
        ) from None
    return StateGraph, START, END


def run_graph(messages, max_steps, complete, tools, cancel, progress):
    state_graph, start, end = require_graph()

    def check_cancel():
        if cancel.is_set():
            raise AiError("cancelled", "Agent job cancelled.")

    def model_step(state):
        check_cancel()
        progress(f"Agent model step {state['steps'] + 1} of {max_steps}.")
        answer = complete(state["messages"])
        check_cancel()
        return {"messages": state["messages"] + [answer], "steps": state["steps"] + 1}

    def next_step(state):
        if not state["messages"][-1].get("tool_calls"):
            return end
        if state["steps"] >= max_steps:
            raise AiError("step_limit", "Agent reached the configured model-step limit.")
        return "tools"

    def tool_step(state):
        results = []
        for call in state["messages"][-1]["tool_calls"]:
            check_cancel()
            results.append(tools(call))
        return {"messages": state["messages"] + results}

    builder = state_graph(_State)
    builder.add_node("model", model_step)
    builder.add_node("tools", tool_step)
    builder.add_edge(start, "model")
    builder.add_conditional_edges("model", next_step)
    builder.add_edge("tools", "model")
    graph = builder.compile()
    result = graph.invoke(
        {"messages": messages, "steps": 0}, {"recursion_limit": 2 * max_steps + 2}
    )
    return result["messages"][-1]["content"]
