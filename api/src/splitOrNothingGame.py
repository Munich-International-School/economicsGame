from fastapi import APIRouter, WebSocket, HTTPException
import hashlib
import random
import asyncio

api = APIRouter(prefix="/splitOrNothingGame")
serverKey = 'idkWhatEverForNow'

class Game:
    def __init__(self, id: int):
        self.id = id
        self.players = {}
        self.pairs = []
        self.matchMakingTask = None

    def start(self):
        self.matchMakingTask = asyncio.create_task(self.matchMaking())

    async def matchMaking(self):
        while True:
            #print('loop ')
            await asyncio.sleep(5)
            self.createPairs()

    def createPairs(self):
        freePlayers = [x for x in self.players.values() if x.free==True]
        for x in range(len(freePlayers)//2):
            a = freePlayers.pop(random.randint(0, len(freePlayers)-1))
            b = freePlayers.pop(random.randint(0, len(freePlayers) - 1))
            self.pairs.append(Pair(self, a, b))


class Player:
    def __init__(self, nickname: str, key: str, game):
        self.nickname = nickname
        self.key = key
        self.free = False
        self.socket = None
        self.stepsDone = 0
        self.game = game
        self.money = 0

    def onJoin(self, socket: WebSocket):
        self.socket = socket
        self.free = True
        #self.game.freePlayers.append(self.nickname)

    def onPairRelease(self):
        self.free = True
        self.stepsDone += 1
        #self.game.freePlayers.append(self.nickname)

    def onPairCreation(self):
        self.free = False

class Pair:
    def __init__(self, game: Game, player1: Player, player2: Player):
        self.game = game
        self.player1 = player1
        self.player2 = player2
        self.player1PicksValues = random.choice([True, False])

        self.pickerGetsOffer = None
        self.offerAccepted = False

        self.currentInput = asyncio.create_task(self.handleValueSelector(self.player1 if self.player1PicksValues else self.player2))

        self.player1.onPairCreation()
        self.player2.onPairCreation()

        self.update = asyncio.create_task(self.updateBothPlayers())



    async def updateBothPlayers(self):
        print("updateBothPlayers")
        await self.player1.socket.send_json({
            "type": "update",
            "hasRightToPick": self.player1PicksValues,
        })
        await self.player2.socket.send_json({
            "type": "update",
            "hasRightToPick": not self.player1PicksValues,
        })

    def releasePair(self):
        self.player1.onPairRelease()
        self.player2.onPairRelease()
        del self

    async def handleValueSelector(self, player):
        while True:
            try:
                data = await player.socket.receive_json()
                self.pickerGetsOffer = max(0, min(data["pickerGets"], 10))
                otherPlayer = self.player2 if self.player1PicksValues else self.player1
                otherPlayer.socket.send_json(
                    {"type": "offer",
                    "pickerGets": self.pickerGetsOffer,
                })
                break
            except:
                pass

        self.currentInput = asyncio.create_task(self.handleValueSelector(player))


    async def handleOfferAccepter(self, player):
        data = await player.socket.receive_json()
        if data["offerAccepted"]=="true":
            self.offerAccepted = True
            offerMaker = self.player1 if self.player1PicksValues else self.player2
            otherPlayer = self.player2 if self.player1PicksValues else self.player1
            offerMaker.money += self.pickerGetsOffer
            otherPlayer.money += 10 - self.pickerGetsOffer

        self.releasePair()


allGames = {}


@api.get("/createGame")
async def createGame(teacherKey: str):
    global allGames
    code = random.randint(0, 99999)
    while code in allGames:
        code = random.randint(0, 99999)

    allGames[code] = Game(code)
    allGames[code].start()

    return {"code":code}

@api.get("/getKey")
async def getKey(gameCode: int, nickname: str):
    if gameCode not in allGames: raise HTTPException(status_code=404, detail="Game not found")
    if nickname in allGames[gameCode].players : raise HTTPException(status_code=403, detail="Player already joined")

    key = hashlib.sha256(f'{str(gameCode)}:{nickname}:{serverKey}'.encode("utf-8")).hexdigest()
    player = Player(nickname, key, allGames[gameCode])
    allGames[gameCode].players[nickname] = player

    return {"gameCode": gameCode, "nickname": nickname, "key": key}


@api.websocket("/playGame")
async def playGame(websocket: WebSocket, gameCode: int, nickname: str, key: str):
    print(key, hashlib.sha256(f"{str(gameCode)}:{nickname}:{serverKey}".encode("utf-8")).hexdigest())
    if hashlib.sha256(f"{str(gameCode)}:{nickname}:{serverKey}".encode("utf-8")).hexdigest() != key:
        await websocket.close(code=405)
        return

    await websocket.accept()

    game = allGames[gameCode]
    player = game.players[nickname]
    player.onJoin(websocket)


    while True:
        await asyncio.sleep(1)


