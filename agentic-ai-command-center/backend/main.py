import os
import traceback
from typing import Annotated, TypedDict, Literal

import httpx
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise RuntimeError(
        "GOOGLE_API_KEY is missing. Add it to backend/.env before starting the server."
    )

# ---------------------------------------------------------------------------
# Generated Projects Directory & Static Mount
# ---------------------------------------------------------------------------
GENERATED_PROJECTS_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "generated_projects"
)
os.makedirs(GENERATED_PROJECTS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Tools
# 1. get_weather (Open-Meteo REST API)
# 2. search_github (GitHub Search REST API)
# 3. schedule_task (Mock task scheduler)
# 4. generate_and_save_code (Builder: local file writer + web preview)
# 5. web_research_summarizer (Wikipedia Knowledge Base REST API)
# ---------------------------------------------------------------------------

WMO_WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


@tool
def get_weather(city: str) -> str:
    """Get real-time current weather information for any city worldwide using the free Open-Meteo API."""
    city_clean = city.strip()
    if not city_clean:
        return "City name is required."

    headers = {
        "User-Agent": "AgenticAICommandCenter/1.0 (Mozilla/5.0 compatible; https://github.com)",
        "Accept": "application/json",
    }

    try:
        # Step 1: Geocoding lookup
        try:
            with httpx.Client(timeout=8.0, headers=headers, follow_redirects=True) as client:
                geo_res = client.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={"name": city_clean, "count": 1, "language": "en", "format": "json"}
                )
                geo_res.raise_for_status()
                geo_data = geo_res.json()
        except Exception as geo_err:
            return f"Weather service geocoding error for '{city_clean}': {str(geo_err)}"

        results = geo_data.get("results")
        if not results:
            return f"Could not find coordinates for city '{city_clean}'. Please verify the spelling."

        loc = results[0]
        name = loc.get("name", city_clean)
        country = loc.get("country", "")
        lat = loc.get("latitude")
        lon = loc.get("longitude")

        # Step 2: Forecast lookup
        try:
            with httpx.Client(timeout=8.0, headers=headers, follow_redirects=True) as client:
                weather_res = client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                    }
                )
                weather_res.raise_for_status()
                current = weather_res.json().get("current", {})
        except Exception as w_err:
            return f"Weather forecast error for '{city_clean}': {str(w_err)}"

        temp = current.get("temperature_2m", "N/A")
        humidity = current.get("relative_humidity_2m", "N/A")
        code = current.get("weather_code", 0)
        wind = current.get("wind_speed_10m", "N/A")
        condition = WMO_WEATHER_CODES.get(code, "Clear")

        place = f"{name}, {country}" if country else name
        return (
            f"Current weather for {place}: {temp}°C, {condition}, "
            f"humidity {humidity}%, wind speed {wind} km/h."
        )
    except Exception as exc:
        return f"Error retrieving real-time weather for '{city_clean}': {str(exc)}"


@tool
def search_github(topic: str) -> str:
    """Find top trending repositories on GitHub for a topic using the public GitHub Search REST API."""
    topic_clean = topic.strip() or "ai agents"
    headers = {
        "User-Agent": "AgenticAICommandCenter/1.0 (Mozilla/5.0 compatible; https://github.com)",
        "Accept": "application/vnd.github.v3+json",
    }
    try:
        with httpx.Client(timeout=8.0, headers=headers, follow_redirects=True) as client:
            res = client.get(
                "https://api.github.com/search/repositories",
                params={"q": topic_clean, "sort": "stars", "order": "desc", "per_page": 3}
            )

            if res.status_code in (403, 429):
                return (
                    f"GitHub API unauthenticated rate limit reached for query '{topic_clean}'. "
                    f"Popular suggested repositories: 'langchain-ai/langgraph' (https://github.com/langchain-ai/langgraph), "
                    f"'bytedance/deer-flow' (https://github.com/bytedance/deer-flow), "
                    f"'langchain-ai/langchain' (https://github.com/langchain-ai/langchain)."
                )

            res.raise_for_status()
            items = res.json().get("items", [])
            if not items:
                return f"No GitHub repositories found matching '{topic_clean}'."

            lines = [f"Top GitHub repositories for '{topic_clean}':"]
            for repo in items:
                name = repo.get("full_name") or repo.get("name")
                stars = repo.get("stargazers_count", 0)
                desc = (repo.get("description") or "No description provided.").strip()
                url = repo.get("html_url", "")
                lines.append(f"- [{name}]({url}) ({stars:,} ⭐): {desc}")
            return "\n".join(lines)
    except Exception as exc:
        return f"Error searching GitHub for '{topic_clean}': {str(exc)}"


@tool
def schedule_task(task: str, time: str) -> str:
    """Create a mock scheduled task with a task description and requested time."""
    if not task.strip() or not time.strip():
        return "Could not schedule the task: both task and time are required."
    return f"Task scheduled successfully (mock): '{task.strip()}' at '{time.strip()}'."


@tool
def generate_and_save_code(filename: str, description: str, code_content: str) -> str:
    """Generate, write, and save complete code (HTML, CSS, JavaScript, Python, etc.) into the local project folder and return the file path and local preview link."""
    clean_name = os.path.basename(filename.strip())
    if not clean_name:
        clean_name = "app.html"

    file_path = os.path.join(GENERATED_PROJECTS_DIR, clean_name)
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(code_content)

        file_size = os.path.getsize(file_path)
        base_url = os.getenv("BACKEND_BASE_URL", "https://agentic-ai-command-center.onrender.com").rstrip("/")
        preview_url = f"{base_url}/generated_projects/{clean_name}"
        return (
            f"Code successfully generated and saved to '{clean_name}' ({file_size} bytes).\n"
            f"- Description: {description.strip() or 'Generated Code Component'}\n"
            f"- Local Path: {file_path}\n"
            f"- Live Browser Preview: {preview_url}"
        )
    except Exception as exc:
        return f"Error saving generated code to '{clean_name}': {str(exc)}"


@tool
def web_research_summarizer(query: str) -> str:
    """Conduct factual web research and summarize information on any topic or entity using Wikipedia's knowledge base."""
    query_clean = query.strip()
    if not query_clean:
        return "Research query cannot be empty."

    headers = {
        "User-Agent": "AgenticAICommandCenter/1.0 (Mozilla/5.0 compatible; https://github.com)",
        "Accept": "application/json",
    }
    try:
        with httpx.Client(timeout=8.0, headers=headers, follow_redirects=True) as client:
            # Step 1: Search Wikipedia for top matching page
            search_res = client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query_clean,
                    "format": "json",
                    "utf8": 1,
                }
            )
            search_res.raise_for_status()
            search_data = search_res.json()
            items = search_data.get("query", {}).get("search", [])

            if not items:
                return f"No encyclopedia results found for query '{query_clean}'."

            best_title = items[0]["title"]

            # Step 2: Fetch detailed summary from Wikipedia REST API
            summary_res = client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{best_title}"
            )
            summary_res.raise_for_status()
            summary_data = summary_res.json()

            title = summary_data.get("title", best_title)
            desc = summary_data.get("description", "")
            extract = summary_data.get("extract", "")
            page_url = summary_data.get("content_urls", {}).get("desktop", {}).get("page", "")

            lines = [f"Factual Research Summary for '{title}':"]
            if desc:
                lines.append(f"Definition: {desc}")
            if extract:
                lines.append(f"Overview: {extract}")
            if page_url:
                lines.append(f"Source Link: [{title}]({page_url})")

            return "\n\n".join(lines)
    except Exception as exc:
        return f"Web research query failed for '{query_clean}': {str(exc)}"


TOOLS = [
    get_weather,
    search_github,
    schedule_task,
    generate_and_save_code,
    web_research_summarizer,
]


# ---------------------------------------------------------------------------
# Smart Model Router & LangGraph Setup
# ---------------------------------------------------------------------------

MODEL_MAP = {
    "gemini-3.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
    "gemini-3.8-flash": "gemini-3.8-flash",
    "gemini-3.1-pro": "gemini-3.1-pro",
    "gemini-4-argon": "gemini-4-argon",
    "gemini-4-carbon": "gemini-4-carbon",
}

SAFE_FALLBACKS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

LLM_CACHE: dict[str, any] = {}


def get_llm_with_tools(model_id: str):
    """Get or initialize cached LLM bound with all builder tools."""
    resolved_name = MODEL_MAP.get(model_id, model_id)
    if resolved_name not in LLM_CACHE:
        # Give experimental or preview models a shorter timeout so fallbacks trigger promptly
        timeout_sec = 6.0 if resolved_name not in SAFE_FALLBACKS else 18.0
        LLM_CACHE[resolved_name] = ChatGoogleGenerativeAI(
            model=resolved_name,
            google_api_key=GOOGLE_API_KEY,
            timeout=timeout_sec,
            max_retries=0,
        ).bind_tools(TOOLS)
    return LLM_CACHE[resolved_name]


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    model_id: str
    model_used: str


async def agent_node(state: AgentState):
    """Smart Model Router: Attempts requested model first, then falls back safely."""
    requested = state.get("model_id") or "gemini-3.5-flash-lite"

    # Assemble candidate order: requested model first, followed by safe fallbacks
    candidates = [requested]
    for fallback in SAFE_FALLBACKS:
        if fallback not in candidates:
            candidates.append(fallback)

    last_error = None
    for candidate in candidates:
        try:
            llm = get_llm_with_tools(candidate)
            response = await llm.ainvoke(state["messages"])
            return {
                "messages": [response],
                "model_used": candidate,
            }
        except Exception as exc:
            print(
                f"[Smart Model Router] Model '{candidate}' encountered {type(exc).__name__}: "
                f"{str(exc)[:100]}. Attempting next fallback..."
            )
            last_error = exc
            continue

    raise last_error or RuntimeError("All model candidates failed.")


def route_after_agent(state: AgentState) -> Literal["tools", "end"]:
    """Continue to tools when Gemini emitted tool calls; otherwise finish."""
    last_message = state["messages"][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return "tools"
    return "end"


builder = StateGraph(AgentState)
builder.add_node("agent", agent_node)
builder.add_node("tools", ToolNode(TOOLS))
builder.add_edge(START, "agent")
builder.add_conditional_edges(
    "agent",
    route_after_agent,
    {"tools": "tools", "end": END},
)
builder.add_edge("tools", "agent")
graph = builder.compile()


# ---------------------------------------------------------------------------
# FastAPI Application & Static Serving
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Agentic AI Command Center API",
    version="1.2.0",
    description="An All-Rounder Builder LangGraph agent powered by Gemini with Smart Model Routing.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve generated code projects statically for instant browser previews
app.mount(
    "/generated_projects",
    StaticFiles(directory=GENERATED_PROJECTS_DIR),
    name="generated_projects",
)


class ExecuteRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    model_id: str | None = Field(default="gemini-3.5-flash-lite")


class TraceEntry(BaseModel):
    node: str
    action: str | None = None
    tools_called: list[str] | None = None
    tool_results: list[str] | None = None


class ExecuteResponse(BaseModel):
    final_response: str
    trace: list[TraceEntry]
    model_used: str
    model_requested: str


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "supported_models": list(MODEL_MAP.keys()),
        "safe_fallbacks": SAFE_FALLBACKS,
        "tools_count": len(TOOLS),
        "tools": [t.name for t in TOOLS],
    }


@app.post("/api/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Prompt cannot be empty.")

    requested_model = request.model_id or "gemini-3.5-flash-lite"
    trace: list[dict] = []
    final_response = ""
    model_used = requested_model

    state = {
        "messages": [HumanMessage(content=prompt)],
        "model_id": requested_model,
        "model_used": requested_model,
    }

    try:
        async for update in graph.astream(state, stream_mode="updates"):
            for node_name, node_update in update.items():
                if isinstance(node_update, dict):
                    if "model_used" in node_update:
                        model_used = node_update["model_used"]

                    messages = node_update.get("messages", [])

                    if node_name == "agent":
                        tool_names = []
                        for message in messages:
                            if isinstance(message, AIMessage):
                                tool_names.extend(
                                    call.get("name", "unknown_tool")
                                    for call in message.tool_calls
                                )
                                if not message.tool_calls:
                                    content = message.content
                                    if isinstance(content, str):
                                        final_response = content
                                    elif isinstance(content, list):
                                        final_response = "\n".join(
                                            item.get("text", "")
                                            for item in content
                                            if isinstance(item, dict)
                                        )
                        trace.append({
                            "node": "agent",
                            "action": "tool_selection" if tool_names else "reasoning",
                        })

                    elif node_name == "tools":
                        called = []
                        results = []
                        for message in messages:
                            if isinstance(message, ToolMessage):
                                called.append(message.name or "unknown_tool")
                                content = message.content
                                results.append(content if isinstance(content, str) else str(content))
                        trace.append({
                            "node": "tools",
                            "tools_called": called,
                            "tool_results": results,
                        })

        if not final_response:
            final_response = "The agent completed execution successfully."

        return ExecuteResponse(
            final_response=final_response,
            trace=trace,
            model_used=model_used,
            model_requested=requested_model,
        )

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Agent execution error: {type(exc).__name__}: {str(exc)}",
        ) from exc
