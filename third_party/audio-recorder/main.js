/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

// Modified for use in LimeSurvey by Martijn van der Klis, 2015

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    inputPoint = null,
    audioRecorder = null,
    Recorder = null;
var rafID = null;
var analyserContext = [];
var canvasWidth, canvasHeight;
var recIndex = 0;
var questionCode;

/* TODO:

- offer mono option
- "Monitor input" switch
*/

function saveAudio() {
    audioRecorder.exportWAV( doneEncoding );
    // could get mono instead by saying
    // audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    // the ONLY time gotBuffers is called is right after a new recording is completed - 
    // so here's where we should set up the download.
    audioRecorder.exportWAV( doneEncoding );
}

function doneEncoding( blob ) {
    Recorder.setupDownload( blob, questionCode );
}

function toggleRecording( e ) {
    if (e.classList.contains("recording")) {
        // Stop recording
        audioRecorder.stop();
        e.classList.remove("recording");
        e.firstElementChild.src = getFolder() + 'img/record.png';
        audioRecorder.getBuffers( gotBuffers );
        var analyser = document.getElementById('analyser' + questionCode);
        analyser.style.display = 'none';
    } else {
        // Start recording
        if (!audioRecorder)
            return;
        questionCode = e.id.substring(6); // id of element is record + questioncode
        e.classList.add("recording");
        e.firstElementChild.src = getFolder() + 'img/stop.png';
        audioRecorder.clear();
        audioRecorder.record();
        
        // Hide the save and play elements
        var save = document.getElementById('save' + questionCode);
        save.style.display = 'none';
        var play = document.getElementById('play' + questionCode);
        play.style.display = 'none';
        var analyser = document.getElementById('analyser' + questionCode);
        analyser.style.display = 'inline';
    }
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers() {
    // For all analysers on the page... 
    var canvases = document.getElementsByClassName('analyser');
    for (n = 0; n < canvases.length; ++n) {
        var canvas = canvases[n]; 

        // If there's no analyserContext, create it
        if (!analyserContext[n]) {
            canvasWidth = canvas.width;
            canvasHeight = canvas.height;
            analyserContext[n] = canvas.getContext('2d');
        }

        // Draw the analyserContext
        var SPACING = 3;
        var BAR_WIDTH = 1;
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData); 

        analyserContext[n].clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext[n].fillStyle = '#F6D565';
        analyserContext[n].lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier;
            var magnitude2 = freqByteData[i * multiplier];
            analyserContext[n].fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext[n].fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
    }
    rafID = window.requestAnimationFrame( updateAnalysers );
}

function toggleMono() {
    if (audioInput !== realAudioInput) {
        audioInput.disconnect();
        realAudioInput.disconnect();
        audioInput = realAudioInput;
    } else {
        realAudioInput.disconnect();
        audioInput = convertToMono( realAudioInput );
    }

    audioInput.connect(inputPoint);
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    updateAnalysers();
}

function initAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia({audio:true}, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
}

// Uploads the audio recording with an XMLHttpRequest
// Found on http://stackoverflow.com/questions/16616010/saving-wav-file-recorded-in-chrome-to-server/
function upload(blob) {
    var xhr = new XMLHttpRequest();
    var fd = new FormData();
    fd.append('output.wav', blob);
    fd.append('qid', questionCode);
    xhr.open('POST', getFolder() + 'upload_wav.php', true);
    xhr.send(fd);
	var recorders = document.getElementsByClassName('recorder');
    for (n = 0; n < recorders.length; ++n) {
		recorders[n].style.display = 'none';
	}

    // Set result of request as the answer to the question
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            $('#' + questionCode).val(xhr.responseText);
			for (n = 0; n < recorders.length; ++n) {
				recorders[n].style.display = 'inline';
			}
        }
    };
}

function getFolder() {
    var url = window.location.href;
    var index = url.indexOf('index.php');
    return url.substring(0, index) + 'third_party/audio-recorder/';
}

function addDownload(questionCode, url) {
    // Update the download link
    var save = document.getElementById('save' + questionCode);
    save.href = url;
    save.download = 'recording.wav';
    save.style.display = 'inline';
    
    // Create the source element
    var source = document.createElement('source');
    source.src = url;
    source.type = 'audio/wav';
    
    // Set the source element as child to the audio element
    var play = document.getElementById('play' + questionCode);
    while (play.firstChild) play.removeChild(play.firstChild);
    play.appendChild(source);
    play.style.display = 'inline';
    play.load();
}

window.addEventListener('load', initAudio);

