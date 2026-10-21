from fastapi import FastAPI, APIRouter
from . import splitOrNothingGame
app = FastAPI()
api = APIRouter(prefix="/api")

api.include_router(splitOrNothingGame.api)


@api.get("/hello")
async def hello():
    return {"hello": "world"}


app.include_router(api)