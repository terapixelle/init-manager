/**
 * TODOS:
 * - add some fancier chat design to the "you're up" message
 * - use the chat message to trigger the banner updates (so players w/ the extension can see it update)
 * - try to get images to load in chat messages (try pulling from github instead of chrome extension?)
 * - allow customization of certain chat messages
 */
(function () {
    console.log('%c Init Manager: Roll20 module loaded.', 'color: yellow');

    const chatContainer     = document.querySelector('#textchat-input');
    const chatText          = chatContainer.querySelector('textarea');
    const chatSpeaker       = chatContainer.querySelector('#speakingas');
    const chatSubmit        = chatContainer.querySelector('button');
    const observerTurnOrder = new MutationObserver(watchTurnOrder);
    const observerOpenBox   = new MutationObserver(watchOpenTurnBox);
    const defaultIcon       = chrome.runtime.getURL("images/init-manager-icon-128.png");
    const defaultIcon32     = chrome.runtime.getURL("images/init-manager-icon-32.png");

    let currentPlayer       = '';
    let doneFirstItemCheck  = false;
    let watchingTurnOrder   = false;
    let watchingOpenTurnBox = false;
    let nextPlayerNode      = '';
    let nextPlayerNodeImage = '';
    let isDM                = false;
    let isInitBoxOpen       = false;
    let totalRoundsTaken    = 1;
    let totalTurnsPerRound  = 0;
    let totalTurnsThisRound = 0;

    const DmElements = {
        location: [
            function(){
                console.log('Init Manager >> DmElements Check >> getting DM start round button')
                return document.querySelector('#startrounds');
            }
        ],
        callback: function(startInitBtn){
            console.log('Init Manager >> DmElements Check >> Callback Results', startInitBtn)
            startInitBtn.addEventListener("click", function(){
                console.log('Init Manager >> DM CLICKED STARTROUNDS! Rolling for Initiative!', isInitBoxOpen)
                if(!doneFirstItemCheck){
                    isInitBoxOpen = true;
                    console.log('Init Manager >> first time, so init is', isInitBoxOpen, 'looking for new init items!')
                    // start looking for all the things
                    checkForItem(turnOrderElements);
                    doneFirstItemCheck = true;
                }else if(document.querySelector('#initManager_currentPlayerBar')){
                    // done initial check, just update the player bar
                    console.log('Init Manager >> done first item check, so updating player bar elsewhere...', isInitBoxOpen)
                    togglePlayerBar(true);
                }
                
                // this button always opens it, so we'll always say...
                isDM && postChatMessage('&{template:default} {{name=?????? ROLL FOR INITIATIVE! ??????}}');
                
                // it doesn't seem to like this... &{template:default}{{name=[x](chrome-extension://bfcdbnpggdklhjmcagallaaiboodlkpm/images/init-manager-icon-128.png)}}
                // but this works... &{template:default}{{name=[x](https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png)}}
                // template: &{template:default}{{name=[x](YOUR_IMAGE_URL#.png)}}{{test=foo}}

            });
        }
    }

    // const turnOrderCharElements = {
    //     location: [
    //         function(){ 
    //             console.log('getting first char name')
    //             return document.querySelector('#initiativewindow .characterlist li:first-child .name');
    //         }
    //     ],
    //     callback: function(nextPlayerNameNode){
    //         console.log('Init Manager >> CharElements Check >> Callback Results', nextPlayerNameNode)
    //     }
    // }

    const turnOrderElements = {
        location: [ 
            function(){ 
                console.log('getting turn order box')
                return document.querySelector('.initiativedialog');
            },
            function(dialog){ 
                console.log('getting char list')
                return document.querySelector('#initiativewindow .characterlist');
            },
            // function(dialog){ 
            //     console.log('getting first char name')
            //     return document.querySelector('#initiativewindow .characterlist li:first-child .name');
            // },
            function(dialog){ 
                console.log('getting next player button')
                return dialog.querySelectorAll('button')[1];
            },
            function(dialog){
                console.log('getting close button')
                return dialog.querySelector('.initiativedialog .ui-dialog-titlebar-close');
            }
        ],
        callback: function(dialog, characterList, nextButton, closeInitBox) {
            console.log('Init Manager > Content Script > turnOrderElements Callback Result:', dialog, nextButton, closeInitBox)
            // start watching the order change
            if(!watchingTurnOrder){
                console.log('TURNING ON WATCH FOR TURN ORDER!')
                updateTurnOrder(characterList);
                watchingTurnOrder = true;

                // create player notice bar
                if(!document.querySelector('#initManager_currentPlayerBar')){
                    document.querySelector('#avatarContainer').insertAdjacentHTML('beforebegin','<div id="initManager_currentPlayerBar"><div class="initManager_currentPlayerInfo">Initiative!!</div><div class="initManager_currentPlayerIcon"><img></div></div>');
                    document.querySelector('#initManager_currentPlayerBar').setAttribute('style','background-image:url(' + defaultIcon + ');background-position:center;background-repeat:no-repeat;background-size:cover;');
                    document.querySelector('.initManager_currentPlayerIcon img').src = defaultIcon;
                }
                
                // TODO: The icon isn't pulling for the very first character unless the player list is updated. Is this an issue? TBD
                // NOTE: the image/icon may not always be there, so we can load this first. Maybe we try to grab the first player/creature without adding to mutation bulk?
            }
            
            // start watching the visibility of order box
            if(!watchingOpenTurnBox){
                console.log('TURNING ON WATCH FOR VISIBILITY OF TURN BOX!')
                watchingOpenTurnBox = true;
                updateTurnBoxVisibility(dialog);
            }

            // add event listener to DM's turn order button
            nextButton.addEventListener("click", function() {
                console.log('%c Init Manager >> send message in chat!', 'color: yellow')
                // NOTE: order changes for more reasons than the next button. commenting for now because this is no longer firing due to other listeners
                // messageToPlayers();
                // updateBanner();
            });

            // add event listener to closing the Turn Order modal
            closeInitBox.addEventListener("click", function() {
                console.log('Init Manager >> INIT BOX CLICKED! IS IT OPEN?', isInitBoxOpen)
                togglePlayerBar(isInitBoxOpen);
                // postChatMessage('------ END INITIATIVE -----');
                isDM && postChatMessage('&{template:default} {{name=???????? END INITIATIVE! ????????}}');
            });

            togglePlayerBar(isInitBoxOpen);
        }
    };


    function isNextPlayersTurn(current = currentPlayer, next = nextPlayerNode){
        // compare current (N)PC's name with the next (N)PC
        let nextNameValue = (next.innerText) ? sanitizeContent(next.innerText) : null;
        console.log('Init Manager > isNextPlayersTurn', next, nextPlayerNode, nextNameValue)
        console.log('Init Manager > compare currentPlayer to nextPlayer:', current, currentPlayer, next, nextPlayerNode, nextNameValue)
        if (current !== nextNameValue){
            console.log('%c Init Manager > new player to start playing!', 'color: green;')
            currentPlayer = nextNameValue;
            return true;
        }else{
            console.log('%c Init Manager > current player is still playing!', 'color: yellow;')
            return false;
        }
    }

    function messageToPlayers(nextTurn){
        // TODO: add "Turn X of Y", "Current Round of Combat: Z" to message
        console.log('Init Manager > messageToPlayers')
        let nameValue = (nextPlayerNode.innerText) ? sanitizeContent(nextPlayerNode.innerText) : null;
        let message = (nameValue) ? nameValue + ', YOU\'RE UP!' : 'NEXT PLAYER/CREATURE';
        let turnMessage = ' {{Turn= '+ totalTurnsThisRound +' of '+ totalTurnsPerRound +' Participants}} {{Round= '+ totalRoundsTaken +'}}';
        let chatMessage = '&{template:default} {{name=Initiative Update!}} {{Player= '+ nameValue +'}}' + turnMessage;
        // if (currentPlayer !== nameValue){
        //     console.log('Init Manager > comparing player names:', currentPlayer, nameValue)
        //     currentPlayer = nameValue;
        //     //updateBanner(nameValue);
        //     postChatMessage(chatMessage);
        // }
        if (nextTurn){
            postChatMessage(chatMessage);
        }
    }
    
    function postChatMessage(message, character = null){
        // TODO: set character that is speaking, default to DM/Player
        // let speaker = (character)?character:chatSpeaker[0];
        // for now, we default to DM/Player settings

        // sanitize. because it's always good to do AND we might allow custom content later
        message = sanitizeContent(message);
        //console.log('Init Manager > postChatMessage', message)
        chatSpeaker.children[0].selected = true;
        // add message to text box
        chatText.value = message;
        // submit
        chatSubmit.click();
    }

    function sanitizeContent(content){
        console.log('sanitizing:', content, typeof(content))
        if(typeof(content) !== 'string') {
            //content = content.innerText
        }
        return content.replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function setRoundDetails(turnList, nextTurn){
        // What this does:
        // set/update the number of turns per round (totalTurnsPerRound)
        // set/update the number of rounds taken (totalTurnsThisRound)
        // if we reach max turns per round:
        //   - increase totalRoundsTaken
        //   - reset totalTurnsThisRound to 0
        //   - announce end of round via chat message

        // what if turns get changed due to addition/subtraction? Reset totalTurnsPerRound?
        let turnsDetected = turnList.children ? turnList.children.length : 0
        if(turnsDetected !== totalTurnsPerRound){
            totalTurnsPerRound = turnsDetected;    
        }

        // Criteria for updating totalTurnsThisRound:
        // 1. if the player IS different than before (filters out changes caused by other things)
        // 2. if the totalTurnsThisRound is less than totalTurnsPerRound

        if(nextTurn && totalTurnsThisRound < totalTurnsPerRound){
            // increase turn count for this round
            totalTurnsThisRound++;
        }else if (nextTurn && totalTurnsThisRound >= totalTurnsPerRound){
            // totalRoundsTaken only updates when totalTurnsThisRound exceeds totalTurnsPerRound
            totalRoundsTaken++;
            totalTurnsThisRound = 1;
            // announce end of round via chat message!
            isDM && postChatMessage('&{template:default} {{name=???? Start of Round '+ totalRoundsTaken +'! ????}}');
        }
    }

    function togglePlayerBar(combat){
        // if Turn Order (combat) is on, turn on the player bar. Otherwise, we hide it.
        let playerBar = document.querySelector('#initManager_currentPlayerBar');
        let hideClass = 'hidden';
        if(combat){
            playerBar.classList.remove(hideClass);
        } else {
            playerBar.classList.add(hideClass);
        }
    }

    function updateBanner(characterName = null, characterImg = null){
        console.log('Init Manager > Update Banner > Char Name', characterName, 'or', nextPlayerNode)
        let finalName = (characterName) ? characterName : ((nextPlayerNode) ? nextPlayerNode.innerText : 'Next Creature')
        let bannerMessage = finalName + '\'s Turn!';
        console.log('Init Manager > Update Banner > Banner Message', bannerMessage)
        if(document.querySelector('#initManager_currentPlayerBar')){
            // update images
            let newBannerIconSrc = (characterImg) ? characterImg : ((nextPlayerNodeImage) ? nextPlayerNodeImage.getAttribute('src') : defaultIcon);
            document.querySelector('.initManager_currentPlayerIcon img').setAttribute('src', newBannerIconSrc);
            document.querySelector('#initManager_currentPlayerBar').setAttribute('style','background-image:url(' + newBannerIconSrc + ');');
            // update text
            document.querySelector('.initManager_currentPlayerInfo').innerText = sanitizeContent(bannerMessage);
        }
    }

    function updateTurnBoxVisibility(orderBox){
        console.log('Init Manager > updateTurnBoxVisibility')
        // DO MUTATION OBSERVER OF THE BOX if one isn't already running

        const config = {attributes: true, childList: false, subtree: false};
        observerOpenBox.observe(orderBox, config);
    }

    function updateTurnOrder(characterList){
        console.log('Init Manager > updateTurnOrder')
        // DO MUTATION OBSERVER OF THE LIST if one isn't already running
        // redefine nextPlayerNode
        const config = {attributes: false, childList: true, subtree: false};
        observerTurnOrder.observe(characterList, config);
    }

    function watchOpenTurnBox(mutationsList, observer){
        // because roll20 handles Turn Order box a bit oddly, we'll watch for when the box's styles to determine when it is displaying. 
        // This will help us update the display of our own things!
        console.log('Init Manager > watchOpenTurnBox')
        for(const mutation of mutationsList) {
            // if(mutation.type === 'childList') {
            //     // checking if any child changes occur upon opening
            //     console.log('--------- >>> DETECTED A child node has been added or removed:', mutation);
            //     watchTurnOrder(mutationsList, observer);
            //     console.log('%c transferring to watchTurnOrder............', 'color: yellow; font-weight: bold;')
            // }
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                //console.log('--------- >>> WATCHING >>> The ' + mutation.attributeName + ' attribute was modified. Full mutation:', mutation);
                if (mutation.attributeName === 'style'){
                    let newBoxAttrs = mutation.target.attributes;
                    let newBoxStyle = newBoxAttrs.getNamedItem(mutation.attributeName).value;
                    console.log('MUTATION STYLE VALUE', newBoxAttrs.getNamedItem('style').value)
                    isInitBoxOpen = newBoxStyle.includes('display: block');
                    console.log('isInitBoxOpen?', isInitBoxOpen)
                    // update isInitBoxOpen here, if possible
                    // let dialogBoxStyle = dialogBox.attributes('style').value;
                    // isInitBoxOpen = dialogBoxStyle.includes('display: block');

                    // if (isInitBoxOpen){
                    //     console.log('%c watchOpenTurnBox >> TURN ORDER IS OPEN, UPDATE BANNER', 'color: pink')
                    //     updateBanner();
                    // }

                }
            }
        }
    }

    function watchTurnOrder(mutationsList, observer){
        // when the turn order is updated, we capture the active player's info
        console.log('Init Manager > watchTurnOrder')
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                console.log('--------- >>> WATCHING >>> A child node has been added or removed:', mutation);
                nextPlayerNode = document.querySelector('.characterlist li:first-child .name');
                nextPlayerNodeImage = (document.querySelector('.characterlist li:first-child img'))? document.querySelector('.characterlist li:first-child img'): '';
                

                if (isInitBoxOpen){
                    console.log('%c watchTurnOrder >> TURN ORDER IS OPEN, UPDATE BANNER', 'color: aqua')
                    console.log('watchTurnOrder >> Player Check:', currentPlayer, nextPlayerNode.innerText, 'same?', currentPlayer === nextPlayerNode.innerText)
                    
                    let nextTurn = isNextPlayersTurn(currentPlayer, nextPlayerNode);
                    setRoundDetails(document.querySelector('#initiativewindow .characterlist'), nextTurn);
                    updateBanner();
                    messageToPlayers(nextTurn);
                }
                
            }
        }
    }

    function checkForItem(t) {
        // check on interval for value
        console.log('checkForItem value:', t)
        function a(t) {
            let a, o = {
                location: null,
                base: window,
                callback: null,
                failCallback: i,
                timeout: 3e4,
                interval: 250
            };
            if (l(o, t), a = typeof o.location, "string" !== a && "function" !== a && !Array.isArray(o.location)) throw new TypeError("checkForItem: config.location is required and must be a string, a function, or an array");
            if ("function" != typeof o.callback) throw new TypeError("checkForItem: config.callback is required and must be a function");
            if ("failLogging" === o.failCallback && (o.failCallback = n), "function" != typeof o.failCallback) throw new TypeError('checkForItem: config.failCallback must be either a function or "failLogging"');
            return Array.isArray(o.location) || (o.location = [o.location]), l(o, {
                _initialAttempt: (new Date).getTime(),
                _attempt: 0,
                _maxAttempts: o.timeout / o.interval
            })
        }
    
        function n(t) {
            "function" == typeof o("console.log") && console.log('"%s" not found after %dms (%d attempts, delaying %dms)', t.location.join(","), (new Date).getTime() - t._initialAttempt, t._attempt, t.interval)
        }
    
        function i() {}
    
        function o(t, a) {
            let n = t.indexOf(".");
            return a = a || this, -1 === n ? a[t] : (a = a[t.substr(0, n)]) && o(t.substr(n + 1), a)
        }
    
        function l(t, a) {
            return e(a, function(a, n) {
                t[n] = a
            }), t
        }
    
        function e(t, a, n) {
            let i;
            for (i in t) t.hasOwnProperty(i) && a.call(n, t[i], i, t)
        }
        t._initialAttempt || (t = a(t)), t._attempt++;
        let r = !0,
            c = [];
        t.location.forEach(function(a) {
            c.push(r && (r = "function" == typeof a ? a.apply(null, c) : o(a, t.base)))
        }), r ? t.callback.apply(null, c) : t._attempt < t._maxAttempts ? setTimeout(function() {
            checkForItem(t)
        }, t.interval) : t.failCallback(t)
    }

    function waitForIt(selector) {
        // async check for something. Ideal for players, who won't see or control Turn Order modal
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                console.log('WE IMMEDIATELY OBSERVED >> ', document.querySelector(selector))
                return resolve(document.querySelector(selector));
            }

            const observeTurnsAsPlayer = new MutationObserver(mutations => {
                console.log('%c OBSERVING WITH WAITFORIT!!', 'color: red;')
                for(const mutation of mutations) {
                    if (mutation.type === 'childList' && document.querySelector(selector)) {
                        console.log('WE OBSERVED >> ', document.querySelector(selector))
                        resolve(document.querySelector(selector));
                        //observer.disconnect();
                    }
                }
            });
            const config = {attributes: false, childList: true, subtree: false};

            observeTurnsAsPlayer.observe(document.body, config);
        });
    }

    function setupPlayerBanner(turnBox) {
        //TODO: duplicate DM actions to setup watches and build banner (see DmElements callback for the script!!)
        console.log('%c Init Manager > setupPlayerBanner', 'color: aliceblue')
    }

    if(document.querySelector('#startrounds')){
        // if the DM, check for DM init button option and set isDM to true
        console.log('%c HELLO DM/GM!!', 'color: green')
        isDM = true;
        checkForItem(DmElements);
    }else{
        // likely a player. wait for the Turn Order box before doing more
        console.log('%c HELLO PLAYER!!', 'color: aliceblue')
        waitForIt('.initiativedialog').then((element) => {
            console.log('ELEMENT', element);
            setupPlayerBanner(element);
        });
    }

    // TODO: check for this if NOT a DM
    // checkForItem(turnOrderElements);
    /*

    try this from: https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
    function waitForIt(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector));
                    observer.disconnect();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }
    */
    //document.addEventListener("DOMContentLoaded", console.log('Init Manager: Hello!'));
})();