if(id = getYouTubeVideoID(document.URL)){ // Direct Links
  videoIDChange(id);

  //tell background.js about this
  chrome.runtime.sendMessage({
    message: "ytvideoid",
    videoID: id
  });
}

//was sponsor data found when doing SponsorsLookup
var sponsorDataFound = false;

//the actual sponsorTimes if loaded and UUIDs associated with them
var sponsorTimes = undefined;
var UUIDs = undefined;

//the video
var v;

//the last time looked at (used to see if this time is in the interval)
var lastTime;

//the last time in the video a sponsor was skipped
//used for the go back button
var lastSponsorTimeSkipped = null;
//used for ratings
var lastSponsorTimeSkippedUUID = null;

//if showing the start sponsor button or the end sponsor button on the player
var showingStartSponsor = true;

//should the video controls buttons be added
var hideVideoPlayerControls = false;

//if the notice should not be shown
//happens when the user click's the "Don't show notice again" button
var dontShowNotice = false;
chrome.storage.local.get(["dontShowNoticeAgain"], function(result) {
  let dontShowNoticeAgain = result.dontShowNoticeAgain;
  if (dontShowNoticeAgain != undefined) {
    dontShowNotice = dontShowNoticeAgain;
  }
});

chrome.runtime.onMessage.addListener( // Detect URL Changes
  function(request, sender, sendResponse) {
    //message from background script
    if (request.message == "ytvideoid") { 
      videoIDChange(request.id);
    }

    //messages from popup script
    if (request.message == "sponsorStart") {
      sponsorMessageStarted();
    }

    if (request.message == "isInfoFound") {
      //send the sponsor times along with if it's found
      sendResponse({
        found: sponsorDataFound,
        sponsorTimes: sponsorTimes
      })
    }

    if (request.message == "getVideoID") {
      sendResponse({
        videoID: getYouTubeVideoID(document.URL)
      })
    }

    if (request.message == "showNoticeAgain") {
      dontShowNotice = false;
    }

    if (request.message == "toggleStartSponsorButton") {
      toggleStartSponsorButton();
    }

    if (request.message == "changeVideoPlayerControlsVisibility") {
      hideVideoPlayerControls = request.value;

      updateVisibilityOfPlayerControlsButton();
    }
});

function videoIDChange(id) {
  //reset sponsor data found check
  sponsorDataFound = false;
  sponsorsLookup(id);

  //see if the onvideo control image needs to be changed
  chrome.runtime.sendMessage({
    message: "getSponsorTimes",
    videoID: id
  }, function(response) {
    if (response != undefined) {
      let sponsorTimes = response.sponsorTimes;
      if (sponsorTimes != undefined && sponsorTimes.length > 0 && sponsorTimes[sponsorTimes.length - 1].length < 2) {
        toggleStartSponsorButton();
      }
    }
  });

  //see if video control buttons should be added
  chrome.storage.local.get(["hideVideoPlayerControls"], function(result) {
    if (result.hideVideoPlayerControls != undefined) {
      hideVideoPlayerControls = result.hideVideoPlayerControls;
    }

    updateVisibilityOfPlayerControlsButton();
  });
}

function sponsorsLookup(id) {
    v = document.querySelector('video') // Youtube video player
    let xmlhttp = new XMLHttpRequest();
    
    //check database for sponsor times
    xmlhttp.open('GET', serverAddress + "/api/getVideoSponsorTimes?videoID=" + id, true);

    xmlhttp.onreadystatechange = function () {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
          sponsorDataFound = true;

          sponsorTimes = JSON.parse(xmlhttp.responseText).sponsorTimes;
          UUIDs = JSON.parse(xmlhttp.responseText).UUIDs;

          // If the sponsor data exists, add the event to run on the videos "ontimeupdate"
          v.ontimeupdate = function () { 
              sponsorCheck(sponsorTimes);
          };
        } else {
          sponsorDataFound = false;
        }
    };
    xmlhttp.send(null);
}

function sponsorCheck(sponsorTimes) { // Video skipping
    //see if any sponsor start time was just passed
    for (let i = 0; i < sponsorTimes.length; i++) {
        //the sponsor time is in between these times, skip it
        //if the time difference is more than 1 second, than the there was probably a skip in time, 
        //  and it's not due to playback
        if (Math.abs(v.currentTime - lastTime) < 1 && sponsorTimes[i][0] >= lastTime && sponsorTimes[i][0] <= v.currentTime) {
          //skip it
          v.currentTime = sponsorTimes[i][1];

          lastSponsorTimeSkipped = sponsorTimes[i][0];
          lastSponsorTimeSkippedUUID = UUIDs[i]; 

          //send out the message saying that a sponsor message was skipped
          openSkipNotice();

          setTimeout(closeSkipNotice, 7000);
        }

        lastTime = v.currentTime;
    }
}

function goBackToPreviousTime() {
  if (lastSponsorTimeSkipped != null) {
    //add a tiny bit of time to make sure it is not skipped again
    v.currentTime = lastSponsorTimeSkipped + 0.001;

    closeSkipNotice();
  }
}

//Adds a sponsorship starts button to the player controls
function addPlayerControlsButton() {
  if (document.getElementById("startSponsorButton") != null) {
    //it's already added
    return;
  }

  let startSponsorButton = document.createElement("button");
  startSponsorButton.id = "startSponsorButton";
  startSponsorButton.className = "ytp-button";
  startSponsorButton.setAttribute("title", "Sponsor Starts Now");
  startSponsorButton.addEventListener("click", startSponsorClicked);

  let startSponsorImage = document.createElement("img");
  startSponsorImage.id = "startSponsorImage";
  startSponsorImage.style.height = "60%";
  startSponsorImage.style.top = "0";
  startSponsorImage.style.bottom = "0";
  startSponsorImage.style.display = "block";
  startSponsorImage.style.margin = "auto";
  startSponsorImage.src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");

  //add the image to the button
  startSponsorButton.appendChild(startSponsorImage);

  let referenceNode = document.getElementsByClassName("ytp-right-controls")[0];
  
  referenceNode.prepend(startSponsorButton);
}

function removePlayerControlsButton() {
  document.getElementById("startSponsorButton").style.display = "none";
}

//adds or removes the player controls button to what it should be
function updateVisibilityOfPlayerControlsButton() {
  if (hideVideoPlayerControls) {
    removePlayerControlsButton();
  } else {
    addPlayerControlsButton();
  }
}

function startSponsorClicked() {
  toggleStartSponsorButton();

  //send back current time with message
  chrome.runtime.sendMessage({
    message: "addSponsorTime",
    time: v.currentTime
  });
}

function toggleStartSponsorButton() {
  if (showingStartSponsor) {
    showingStartSponsor = false;
    document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStopIconSponsorBlocker256px.png");
  } else {
    showingStartSponsor = true;
    document.getElementById("startSponsorImage").src = chrome.extension.getURL("icons/PlayerStartIconSponsorBlocker256px.png");
  }
}

//Opens the notice that tells the user that a sponsor was just skipped
function openSkipNotice(){
  if (dontShowNotice) {
    //don't show, return
    return;
  }

  let noticeElement = document.createElement("div");
  noticeElement.id = "sponsorSkipNotice";
  noticeElement.className = "sponsorSkipObject";

  let logoElement = document.createElement("img");
  logoElement.id = "sponsorSkipLogo";
  logoElement.src = chrome.extension.getURL("icons/LogoSponsorBlocker256px.png");

  let noticeMessage = document.createElement("div");
  noticeMessage.id = "sponsorSkipMessage";
  noticeMessage.className = "sponsorSkipObject";
  noticeMessage.innerText = "Hey, you just skipped a sponsor!";
  
  let noticeInfo = document.createElement("p");
  noticeInfo.id = "sponsorSkipInfo";
  noticeInfo.className = "sponsorSkipObject";
  noticeInfo.innerText = "This message will disapear in 7 seconds";
  
  //thumbs up and down buttons
  let voteButtonsContainer = document.createElement("div");
  voteButtonsContainer.id = "sponsorTimesVoteButtonsContainer";
  voteButtonsContainer.setAttribute("align", "center");

  let upvoteButton = document.createElement("img");
  upvoteButton.id = "sponsorTimesUpvoteButtonsContainer"
  upvoteButton.className = "sponsorSkipObject voteButton";
  upvoteButton.src = chrome.extension.getURL("icons/upvote.png");
  upvoteButton.addEventListener("click", upvote);

  let downvoteButton = document.createElement("img");
  downvoteButton.id = "sponsorTimesDownvoteButtonsContainer"
  downvoteButton.className = "sponsorSkipObject voteButton";
  downvoteButton.src = chrome.extension.getURL("icons/downvote.png");
  downvoteButton.addEventListener("click", downvote);

  //add thumbs up and down buttons to the container
  voteButtonsContainer.appendChild(upvoteButton);
  voteButtonsContainer.appendChild(downvoteButton);

  let buttonContainer = document.createElement("div");
  buttonContainer.setAttribute("align", "center");

  let goBackButton = document.createElement("button");
  goBackButton.innerText = "Go back";
  goBackButton.className = "sponsorSkipButton";
  goBackButton.addEventListener("click", goBackToPreviousTime);

  let hideButton = document.createElement("button");
  hideButton.innerText = "Dismiss";
  hideButton.className = "sponsorSkipButton";
  hideButton.addEventListener("click", closeSkipNotice);

  let dontShowAgainButton = document.createElement("button");
  dontShowAgainButton.innerText = "Don't Show This Again";
  dontShowAgainButton.className = "sponsorSkipDontShowButton";
  dontShowAgainButton.addEventListener("click", dontShowNoticeAgain);

  buttonContainer.appendChild(goBackButton);
  buttonContainer.appendChild(hideButton);
  buttonContainer.appendChild(document.createElement("br"));
  buttonContainer.appendChild(document.createElement("br"));
  buttonContainer.appendChild(dontShowAgainButton);

  noticeElement.appendChild(logoElement);
  noticeElement.appendChild(noticeMessage);
  noticeElement.appendChild(noticeInfo);
  noticeElement.appendChild(voteButtonsContainer);
  noticeElement.appendChild(buttonContainer);

  let referenceNode = document.getElementById("info");
  if (referenceNode == null) {
    //old YouTube
    referenceNode = document.getElementById("watch-header");
  }
  referenceNode.prepend(noticeElement);
}

function upvote() {
  vote(1);

  closeSkipNotice();
}

function downvote() {
  vote(0);

  //change text to say thanks for voting
  //remove buttons
  document.getElementById("sponsorTimesVoteButtonsContainer").removeChild(document.getElementById("sponsorTimesUpvoteButtonsContainer"));
  document.getElementById("sponsorTimesVoteButtonsContainer").removeChild(document.getElementById("sponsorTimesDownvoteButtonsContainer"));

  //add thanks for voting text
  let thanksForVotingText = document.createElement("p");
  thanksForVotingText.id = "sponsorTimesThanksForVotingText";
  thanksForVotingText.innerText = "Thanks for voting!"

  //add extra info for voting
  let thanksForVotingInfoText = document.createElement("p");
  thanksForVotingInfoText.id = "sponsorTimesThanksForVotingInfoText";
  thanksForVotingInfoText.innerText = "Hit go back to get to where you came from."

  //add element to div
  document.getElementById("sponsorTimesVoteButtonsContainer").appendChild(thanksForVotingText);
  document.getElementById("sponsorTimesVoteButtonsContainer").appendChild(thanksForVotingInfoText);
}

function vote(type) {
  chrome.runtime.sendMessage({
    message: "submitVote",
    type: type,
    UUID: lastSponsorTimeSkippedUUID
  });
}

//Closes the notice that tells the user that a sponsor was just skipped
function closeSkipNotice(){
  let notice = document.getElementById("sponsorSkipNotice");
  if (notice != null) {
    notice.remove();
  }
}

function dontShowNoticeAgain() {
  chrome.storage.local.set({"dontShowNoticeAgain": true});

  dontShowNotice = true;

  closeSkipNotice();
}

function sponsorMessageStarted() {
    let v = document.querySelector('video');

    //send back current time
    chrome.runtime.sendMessage({
      message: "time",
      time: v.currentTime
    });

    //update button
    toggleStartSponsorButton();
}

function getYouTubeVideoID(url) { // Returns with video id else returns false
  var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
  var match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : false;
}