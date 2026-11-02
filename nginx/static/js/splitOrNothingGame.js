const API = '/api/splitOrNothingGame'
const TIME_LIMIT = 30 // seconds per decision, enforced on the client only

// screen numbers, in the same order as SCREEN_IDS
const JOIN = 0, ACCEPT = 1, WAIT = 2, PICK = 3, HOST_SETUP = 4, HOST_DASH = 5, LOBBY = 6, OVER = 7
const SCREEN_IDS = ["joinGameScreen", "acceptSplitScreen", "waitingForPlayerScreen", "pickSplitValuesScreen",
    "hostSetupScreen", "hostDashScreen", "lobbyScreen", "gameOverScreen"]
const GAME_NAMES = {splitOrNothing: 'Split or nothing'} // add future games here
const STATUS_TEXT = {lobby: 'Waiting to start', playing: 'Round in progress', between: 'Round finished'}

var state = JOIN
var ws = null
var timer = null
var hostPoll = null
var gameIsOver = false
var slider = document.getElementById("pickValSlider")

function setState(s)
{
    state = s
    applyCurrentState()
    updateMusic()
}

function applyCurrentState()
{
    SCREEN_IDS.forEach((id, i) => document.getElementById(id).hidden = i !== state)
}

function stopTimer()
{
    clearInterval(timer)
}

function startTimer(label, onExpire)
{
    var left = TIME_LIMIT
    stopTimer()
    function tick()
    {
        label.textContent = left
        if (left-- <= 0)
        {
            stopTimer()
            onExpire()
        }
    }
    tick()
    timer = setInterval(tick, 1000)
}

function send(data)
{
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
}

function playerInfo()
{
    var code = sessionStorage.getItem('code')
    return code ? 'Game ' + code + ' · ' + sessionStorage.getItem('name') : ''
}

function showWaiting(text)
{
    stopTimer()
    document.getElementById("waitingText").textContent = text
    document.getElementById("waitingInfo").textContent = playerInfo()
    setState(WAIT)
}

function showLobby(title, details)
{
    stopTimer()
    document.getElementById("lobbyTitle").textContent = title
    document.getElementById("lobbyDetails").textContent = details
    document.getElementById("lobbyInfo").textContent = playerInfo()
    setState(LOBBY)
}

function showError(text)
{
    document.getElementById("joinError").textContent = text
}

// picker
function showSplit(prefix, mine, theirs)
{
    document.getElementById(prefix + "YouGet").textContent = mine
    document.getElementById(prefix + "OtherGets").textContent = theirs
    document.getElementById(prefix + "Bar").style.setProperty('--mine', mine * 10 + '%')
}

function updateSlider()
{
    showSplit("pickVal", slider.value, 10 - slider.value)
}

function startPick()
{
    slider.value = 5
    updateSlider()
    startTimer(document.getElementById("pickValTimer"), submitOffer)
    setState(PICK)
}

function submitOffer()
{
    send({pickerGets: Number(slider.value)})
    showWaiting('Waiting for the other player to answer')
}

// responder
function startAccept(pickerGets)
{
    showSplit("acceptSplit", 10 - pickerGets, pickerGets)
    startTimer(document.getElementById("acceptSplitTimer"), () => answer(false))
    setState(ACCEPT)
}

function answer(accepted)
{
    send({offerAccepted: accepted ? "true" : "false"})
    showWaiting('Waiting for the result')
}

// what the server tells a player
function onMessage(msg)
{
    console.log(msg)
    if (msg.type === 'lobby')
    {
        showLobby('Waiting for the host', 'The next round starts when the host says so.')
    }
    else if (msg.type === 'roundStart')
    {
        showWaiting('Waiting for someone to free up')
    }
    else if (msg.type === 'update')
    {
        if (msg.hasRightToPick) startPick()
        else showWaiting('The other player is choosing a split')
    }
    else if (msg.type === 'offer')
    {
        startAccept(msg.pickerGets)
    }
    else if (msg.type === 'roundOver')
    {
        if (msg.unpaired) showLobby('No partner this round', `Nobody was left to pair you with. Total: ${msg.money} coins. Waiting for the host to start the next round.`)
        else showLobby('Round complete', `You earned ${msg.earned} coins this round. Total: ${msg.money}. Waiting for the host to start the next round.`)
    }
    else if (msg.type === 'gameOver')
    {
        showGameOver(msg.money)
    }
}

function showGameOver(money)
{
    gameIsOver = true
    stopTimer()
    var playerKeys = ['key', 'code', 'name']
    playerKeys.forEach(k => sessionStorage.removeItem(k))
    document.getElementById("gameOverTotal").textContent = money
    setState(OVER)
    if (ws) ws.close()
}

function leaveGame()
{
    gameIsOver = false
    showError('')
    setState(JOIN)
}

async function getKey()
{
    var code = document.getElementById("joinGameCodeInput").value.trim()
    var name = document.getElementById("joinGameNameInput").value.trim()
    if (!code || !name) return showError('Enter the game code and a name.')
    try {
        var keyRequest = await fetch(API + '/getKey?gameCode=' + encodeURIComponent(code) + '&nickname=' + encodeURIComponent(name))
        if (!keyRequest.ok){
            return showError(keyRequest.status === 404 ? 'No game with that code.'
                : keyRequest.status === 403 ? 'That name is already taken in this game.'
                : 'Could not join. Try again.')
        }
        var keyJson = await keyRequest.json()
        sessionStorage.setItem('key', keyJson['key'])
        sessionStorage.setItem('code', code)
        sessionStorage.setItem('name', name)
        showError('')
        joinAndPlay()
    } catch {
        showError('Server not reachable.')
    }
}

function joinAndPlay()
{
    var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + API + '/playGame'
        + '?gameCode=' + encodeURIComponent(sessionStorage.getItem('code'))
        + '&nickname=' + encodeURIComponent(sessionStorage.getItem('name'))
        + '&key=' + encodeURIComponent(sessionStorage.getItem('key'))
    gameIsOver = false
    ws = new WebSocket(url)
    ws.onopen = () => showLobby('Connected', '')
    ws.onmessage = e => onMessage(JSON.parse(e.data))
    ws.onclose = () => {
        stopTimer()
        if (gameIsOver) return // the host ended the game, so stay on the game over screen
        setState(JOIN)
        showError('Disconnected. Enter your code and name to join.')
    }
}

// host
function showHostError(text)
{
    document.getElementById("hostError").textContent = text
    document.getElementById("hostError2").textContent = text
}

async function createGame()
{
    var teacherKey = document.getElementById("hostKeyInput").value.trim()
    var game = document.querySelector('input[name="game"]:checked')
    if (!game) return showHostError('Pick a game first.')
    if (!teacherKey) return showHostError('Enter the teacher key.')
    try {
        var res = await fetch(API + '/createGame?teacherKey=' + encodeURIComponent(teacherKey) + '&game=' + game.value, {method: 'POST'})
        if (!res.ok) return showHostError('Could not create a game. Try again.')
        var json = await res.json()
        sessionStorage.setItem('hostCode', String(json['gameCode']).padStart(5, '0'))
        sessionStorage.setItem('hostKey', teacherKey)
        sessionStorage.setItem('hostGame', game.value)
        showHostError('')
        showHostDash()
    } catch {
        showHostError('Server not reachable.')
    }
}

function hostCall(action, method)
{
    var query = '?gameCode=' + encodeURIComponent(sessionStorage.getItem('hostCode'))
        + '&teacherKey=' + encodeURIComponent(sessionStorage.getItem('hostKey'))
    return fetch(API + '/' + action + query, {method: method})
}

function showHostDash()
{
    document.getElementById("hostCode").textContent = sessionStorage.getItem('hostCode')
    document.getElementById("hostGameName").textContent = GAME_NAMES[sessionStorage.getItem('hostGame')] || ''
    setState(HOST_DASH)
    refreshHost()
    clearInterval(hostPoll)
    hostPoll = setInterval(refreshHost, 2000)
}

async function refreshHost()
{
    try {
        var res = await hostCall('gameStatus', 'GET')
        if (res.status === 404 || res.status === 403)
        {
            leaveHost()
            return showError('That game no longer exists.')
        }
        renderHost(await res.json())
    } catch {
        showHostError('Server not reachable.')
    }
}

function renderHost(s)
{
    var ready = s.players >= 2
    var text = (s.round ? 'Round ' + s.round + ': ' : '') + STATUS_TEXT[s.status]
    if (s.status !== 'playing' && !ready) text = 'Waiting for players (need 2)'
    document.getElementById("hostPlayers").textContent = s.players + (s.players === 1 ? ' player' : ' players') + ' joined'
    document.getElementById("hostStatus").textContent = text
    var button = document.getElementById("hostStartBtn")
    button.textContent = s.round ? 'Start next round' : 'Start round'
    button.disabled = s.status === 'playing' || !ready
    showHostError('')
}

async function startRound()
{
    try {
        var res = await hostCall('startRound', 'POST')
        if (!res.ok) showHostError('Could not start the round.')
    } catch {
        showHostError('Server not reachable.')
    }
    refreshHost()
}

async function endGame()
{
    if (!confirm('End this game for everyone?')) return
    try {
        await hostCall('endGame', 'POST')
    } catch {
        // the server is gone, so the game is over anyway
    }
    leaveHost()
}

function leaveHost()
{
    clearInterval(hostPoll)
    var hostKeys = ['hostCode', 'hostKey', 'hostGame']
    hostKeys.forEach(k => sessionStorage.removeItem(k))
    setState(JOIN)
}

// music: lobby track on most screens, game track while picking or answering
function updateMusic()
{
    var lobby = document.getElementById('lobbyMusic')
    var game = document.getElementById('gameMusic')   // optional second track
    if (!lobby) return
    var want = (game && (state === ACCEPT || state === PICK)) ? game : lobby
    var other = (want === lobby) ? game : lobby
    if (other) other.pause()
    if (want.paused)
    {
        want.volume = 0.3
        want.play().catch(() => console.log('Music is waiting for the first click'))
    }
}
document.addEventListener('click', updateMusic)
document.addEventListener('keydown', updateMusic)

applyCurrentState()
if (sessionStorage.getItem('hostCode')) showHostDash() // the host refreshed the page
else if (sessionStorage.getItem('key')) joinAndPlay() // a player refreshed the page