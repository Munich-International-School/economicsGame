var state=0
var acceptSplitScreen = document.getElementById("acceptSplitScreen")
var pickSplitValues = document.getElementById("pickSplitValuesScreen")
var waitingForPlayerScreen = document.getElementById("waitingForPlayerScreen")
var joinGameScreen = document.getElementById("joinGameScreen")


function applyCurrentState(){
    acceptSplitScreen.style.display = 'none'
    pickSplitValues.style.display = 'none'
    waitingForPlayerScreen.style.display = 'none'
    joinGameScreen.style.display = 'none'

    switch (state){
        case 0:
            joinGameScreen.style.display = 'initial'
            break
        case 1:
            acceptSplitScreen.style.display = 'initial'
            break
        case 2:
            waitingForPlayerScreen.style.display = 'initial'
            break
        case 3:
            pickSplitValues.style.display = 'initial'
            break

    }
}
async function getKey(){
    var code = document.getElementById("joinGameCodeInput").value
    var name = document.getElementById("joinGameNameInput").value
    var keyRequest = await fetch('/api/splitOrNothingGame/getKey'+'?gameCode='+code+'&nickname='+name)
    var keyJson = await keyRequest.json()
    var key = keyJson['key']
    localStorage.setItem('key', key)
    localStorage.setItem('name', name)
    localStorage.setItem('code', code)
    joinAndPlay()
}
async function joinAndPlay(){
    var key = localStorage.getItem('key')
    var name = localStorage.getItem('name')
    var code = localStorage.getItem('code')

    const socket = new WebSocket("ws://"+location.host+"/api/splitOrNothingGame/playGame?gameCode="+code+"&nickname="+name+"&key="+key)

    socket.onopen = (data) => {
        console.log(data)

    }

    socket.onmessage = (data) => {
        //console.log(data)
        data = JSON.parse(data)
        console.log(data)
    }


}

applyCurrentState()