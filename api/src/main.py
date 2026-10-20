from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

app = FastAPI()
api = APIRouter(prefix="/api")


@api.get("/hello")
async def hello():
    return {"hello": "world"}

app.include_router(api)