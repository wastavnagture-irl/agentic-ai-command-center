from dotenv import load_dotenv
import os
load_dotenv(".env")
from langchain_google_genai import ChatGoogleGenerativeAI
llm = ChatGoogleGenerativeAI(model="gemini-3.8-flash", google_api_key=os.getenv("GOOGLE_API_KEY"))
response = llm.invoke("Say hello in one word.")
print("SUCCESS:", response.content)
