from fastapi import FastAPI, APIRouter, websockets

app = FastAPI()
api = APIRouter(prefix="/api")


@api.get("/hello")
async def hello():
    return {"hello": "world"}




app.include_router(api)