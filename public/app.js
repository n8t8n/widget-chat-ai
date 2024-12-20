// This code leverages the Google Generative AI's model.startChat and model.generateContent methods to facilitate interactions with the Gemini API. It was initially developed for a test scenario incorporating vision and audio capabilities

const CHAT_SERVER_URL = "http://localhost:5700/chat";
const USER_ID = "anonymous_" + Math.random().toString(36).substring(7);

const loadScripts = async () => {
  const scripts = ["assets/js/marked.js", "assets/js/purify.js"];

  const loadScript = (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script ${src}`));
      document.head.appendChild(script);
    });
  };

  try {
    await Promise.all(scripts.map(loadScript));
  } catch (error) {
    console.error(error);
  }
};

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "assets/css/style.css";
document.head.appendChild(link);

class ChatWidget {
  constructor() {
    this.createWidget();
    this.addEventListeners();
    this.currentFile = null;
    this.fileMode = false;
    this.recording = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.mediaStream = null;

    loadScripts();
  }

  createWidget() {
    const widgetHTML = `
     <button id="ai-chat-toggle" aria-label="Open Chat"><!-- License: MIT. Made by Mikolaj Dobrucki: https://github.com/mikolajdobrucki/ikonate -->
<svg width="24px" height="24px" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg" aria-labelledby="chatIconTitle" stroke="var(--tc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" color="#000000"> <title id="chatIconTitle">Chat</title> <path d="M8.82388455,18.5880577 L4,21 L4.65322944,16.4273939 C3.00629211,15.0013 2,13.0946628 2,11 C2,6.581722 6.4771525,3 12,3 C17.5228475,3 22,6.581722 22,11 C22,15.418278 17.5228475,19 12,19 C10.8897425,19 9.82174472,18.8552518 8.82388455,18.5880577 Z"/> </svg></button>
      <div id="ai-chat-widget">
        <div id="ai-chat-header">
          <div id="ai-chat-header-title">
            <span>AI Assistant</span>
          </div>
          <button id="ai-chat-close" aria-label="Close Chat">✕</button>
          <div class="switch-model-assistant" id="ai-chat-mode-badge">Chat with Assistant</div>
        </div>
        <div id="top-info-data" class="top-info">To start a new conversation or delete attachment file click on <button id="clear-chat-button">Clear</button> button or send the command "/clear"</div>
        <div id="ai-chat-messages"></div>
        <div id="ai-chat-file-preview"></div> <!-- New file preview section -->
        <div id="ai-chat-input-area">
          <button id="ai-chat-stop-recording" aria-label="Stop Recording">Stop</button>
          <button disabled id="ai-chat-menu-toggle" aria-label="Open Attachment Menu">
            <svg width="24px" height="24px" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-labelledby="clipIconTitle" stroke="var(--tc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" color="#000000">
              <title id="clipIconTitle">Attachment (paper clip)</title>
              <path d="M7.93517 13.7796L15.1617 6.55304C16.0392 5.67631 17.4657 5.67631 18.3432 6.55304C19.2206 7.43052 19.2206 8.85774 18.3432 9.73522L8.40091 19.5477C6.9362 21.0124 4.56325 21.0124 3.09854 19.5477C1.63382 18.0837 1.63382 15.7093 3.09854 14.2453L12.9335 4.53784C14.984 2.48739 18.3094 2.48739 20.3569 4.53784C22.4088 6.58904 22.4088 9.91146 20.3584 11.9619L13.239 19.082"/>
            </svg>
          </button>
          <div id="ai-chat-attachment-menu">
            <button id="ai-chat-file-option"><svg style=" vertical-align: bottom; height: 18px;"width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-labelledby="fileIconTitle" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" color="#000"><path d="M13 3v6h6"/><path d="m13 3 6 6v12H5V3z"/></svg> File</button>
            <button id="ai-chat-record-option"> <svg style=" vertical-align: bottom; height: 18px;" color="#fff" fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#fff" aria-labelledby="microphoneIconTitle" xmlns="http://www.w3.org/2000/svg" viewBox="4.6080000000000005 2.736 14.783999999999999 19.488" style="max-height: 500px" width="14.783999999999999" height="19.488"><path d="M17 12a5 5 0 0 1-10 0m5 5v4"/><rect rx="2" y="4" x="10" height="10" width="4"/></svg> Audio</button>
          </div>
          <input type="file" id="ai-chat-file-input" accept="image/*,application/pdf,audio/*">
          <div id="ai-chat-input-wrapper">
            <div id="ai-chat-input" contenteditable="true" placeholder="Type your message..."></div>
          </div>
          <button id="ai-chat-send">
            <svg width="24px" height="24px" viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg" aria-labelledby="arrowUpIconTitle" stroke="var(--tc)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" color="#000000">
              <title id="arrowUpIconTitle">Arrow Up</title>
              <path d="M9 10.5l3-3 3 3"/>
              <path d="M12 16.5V9"/>
              <path stroke-linecap="round" d="M12 7.5V9"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    const container = document.createElement("div");
    container.innerHTML = widgetHTML;
    document.body.appendChild(container);
  }

  addEventListeners() {
    const filePreview = document.getElementById("ai-chat-file-preview");
    const toggle = document.getElementById("ai-chat-toggle");
    const widget = document.getElementById("ai-chat-widget");
    const close = document.getElementById("ai-chat-close");
    const clearData = document.getElementById("clear-chat-button");
    const topInfoData = document.getElementById("top-info-data");
    const input = document.getElementById("ai-chat-input");
    const send = document.getElementById("ai-chat-send");
    const messages = document.getElementById("ai-chat-messages");
    const fileInput = document.getElementById("ai-chat-file-input");
    const modeBadge = document.getElementById("ai-chat-mode-badge");
    const menuToggle = document.getElementById("ai-chat-menu-toggle");
    const attachmentMenu = document.getElementById("ai-chat-attachment-menu");
    const fileOption = document.getElementById("ai-chat-file-option");
    const recordOption = document.getElementById("ai-chat-record-option");
    const stopRecordingButton = document.getElementById(
      "ai-chat-stop-recording"
    );

    // Add event listener for clearData button
    clearData.addEventListener("click", () => {
      sendMessage("/clear");
    });

    // Placeholder handling
    input.addEventListener("focus", () => {
      if (input.textContent === "Type your message...") {
        input.textContent = "";
      }
    });

    input.addEventListener("blur", () => {
      if (input.textContent === "") {
        input.textContent = "Type your message...";
      }
    });

    // Add paste event listener to strip HTML tags
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const formattedText = text.replace(/\n/g, "<br>");

      document.execCommand("insertHTML", false, formattedText);
    });

    close.addEventListener("click", () => {
      widget.classList.remove("open");
    });

    toggle.addEventListener("click", () => {
      widget.classList.toggle("open");
    });

    menuToggle.addEventListener("click", () => {
      attachmentMenu.classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
      if (
        !menuToggle.contains(event.target) &&
        !attachmentMenu.contains(event.target)
      ) {
        attachmentMenu.classList.remove("open");
      }
    });

    fileOption.addEventListener("click", () => {
      fileInput.click();
      attachmentMenu.classList.remove("open");
    });

    recordOption.addEventListener("click", async () => {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        // Stop recording
        this.mediaRecorder.stop();
        recordOption.textContent = "Audio";
        stopRecordingButton.style.display = "none";
      } else {
        // Start recording
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          this.mediaRecorder = new MediaRecorder(stream);

          this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
          };

          this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: "audio/mp3" });
            const reader = new FileReader();

            reader.onloadend = () => {
              const base64Audio = reader.result; // This gives us the full data URL

              this.currentFile = {
                data: base64Audio, // Keep full data URL - server will handle stripping
                type: "audio/mp3",
                name: "recording.mp3",
              };
              this.fileMode = true;
              modeBadge.textContent = "Chat with file";
              modeBadge.classList.add("switch-model-file"); // Add 'file' class

              // Display file preview with delete button
              filePreview.innerHTML = `
                <div class="chat-attachments">
                  <div class="filetype-attachment">
                    ${this.getFilePreviewHTML(
                      this.currentFile.type,
                      this.currentFile.data
                    )}
                  </div> 
                  <button id="ai-chat-delete-preview" aria-label="Delete Preview">Delete</button>
                </div>
              `;

              // Add event listener for delete button
              const deletePreviewButton = document.getElementById(
                "ai-chat-delete-preview"
              );
              deletePreviewButton.addEventListener("click", () => {
                this.currentFile = null;
                this.fileMode = false;
                modeBadge.textContent = "Chat with Assistant";
                modeBadge.classList.remove("switch-model-file"); // Remove 'file' class
                filePreview.innerHTML = "";
                fileInput.value = "";
              });
            };

            reader.readAsDataURL(audioBlob);
            this.audioChunks = [];
          };

          this.mediaRecorder.start();
          recordOption.innerHTML =
            '<svg style=" vertical-align: bottom; height: 18px;" color="#fff" fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#fff" aria-labelledby="microphoneIconTitle" xmlns="http://www.w3.org/2000/svg" viewBox="4.6080000000000005 2.736 14.783999999999999 19.488" style="max-height: 500px" width="14.783999999999999" height="19.488"><path d="M17 12a5 5 0 0 1-10 0m5 5v4"/><rect rx="2" y="4" x="10" height="10" width="4"/></svg> Stop Recording';

          stopRecordingButton.style.display = "block";
        } catch (error) {
          console.error("Error accessing media devices.", error);
        }
      }
      attachmentMenu.classList.remove("open");
    });

    stopRecordingButton.addEventListener("click", () => {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
        recordOption.innerHTML =
          '<svg style=" vertical-align: bottom; height: 18px;" color="#fff" fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-width="2" stroke="#fff" aria-labelledby="microphoneIconTitle" xmlns="http://www.w3.org/2000/svg" viewBox="4.6080000000000005 2.736 14.783999999999999 19.488" style="max-height: 500px" width="14.783999999999999" height="19.488"><path d="M17 12a5 5 0 0 1-10 0m5 5v4"/><rect rx="2" y="4" x="10" height="10" width="4"/></svg> Recording';
        stopRecordingButton.style.display = "none";
      }
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.currentFile = {
            data: event.target.result,
            type: file.type,
            name: file.name,
          };
          this.fileMode = true;
          modeBadge.textContent = "Chat with file";
          modeBadge.classList.add("switch-model-file"); // Add 'file' class

          // Display file preview with delete button
          filePreview.innerHTML = `
            <div class="chat-attachments">
              <div class="filetype-attachment">
                ${this.getFilePreviewHTML(file.type, event.target.result)}
              </div> 
              <button id="ai-chat-delete-preview" aria-label="Delete Preview">Delete</button>
            </div>
          `;

          // Add event listener for delete button
          const deletePreviewButton = document.getElementById(
            "ai-chat-delete-preview"
          );
          deletePreviewButton.addEventListener("click", () => {
            this.currentFile = null;
            this.fileMode = false;
            modeBadge.textContent = "Chat with Assistant";
            modeBadge.classList.remove("switch-model-file"); // Remove 'file' class
            filePreview.innerHTML = "";
            fileInput.value = "";
          });
        };
        reader.readAsDataURL(file);
      }
    });

    const sendMessage = async (messageText = input.textContent.trim()) => {
      if (
        messageText.toLowerCase() === "/clear" ||
        messageText.toLowerCase() === "/reset"
      ) {
        messages.innerHTML = "";
        this.fileMode = false;
        this.currentFile = null;
        fileInput.value = "";
        modeBadge.textContent = "Chat with Assistant";
        modeBadge.classList.remove("switch-model-file");
        filePreview.innerHTML = "";

        // Clear input
        input.textContent = "";

        // Send the command to the server
        try {
          const payload = {
            message: messageText,
            userId: USER_ID,
          };

          // Show AI message text
          const loadingMessage = document.createElement("div");
          loadingMessage.classList.add("ai-chat-message", "ai");
          loadingMessage.style.opacity = 0;
          loadingMessage.style.transform = "scale(0)";
          loadingMessage.style.transition =
            "opacity .2s ease-in-out, transform .3s ease-in-out";
          messages.appendChild(loadingMessage);

          setTimeout(() => {
            loadingMessage.style.opacity = 1;
            loadingMessage.style.transform = "scale(1)";
          }, 1500);

          // Scroll to bottom
          messages.scrollTop = messages.scrollHeight;

          const response = await fetch(CHAT_SERVER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const data = await response.json();

          // Remove loading message
          messages.removeChild(loadingMessage);

          // Create AI response message element
          const aiMessage = document.createElement("div");
          aiMessage.classList.add("ai-chat-message", "ai");

          // Configure marked to treat newlines as line breaks
          marked.setOptions({
            breaks: true,
          });

          const sanitizedText = DOMPurify.sanitize(marked.parse(data.text));
          aiMessage.innerHTML = sanitizedText;
          messages.appendChild(aiMessage);

          // Scroll to bottom
          messages.scrollTop = messages.scrollHeight;
        } catch (error) {
          console.error("Chat error:", error);
          const errorMessage = document.createElement("div");
          errorMessage.classList.add("ai-chat-message", "ai");
          errorMessage.style.setProperty(
            "background",
            "transparent",
            "important"
          );
          errorMessage.style.fontFamily = "monospace";
          errorMessage.textContent =
            "*Error sending message. Please try again.";
          messages.appendChild(errorMessage);
          messages.scrollTop = messages.scrollHeight;
        }

        return;
      }

      // Create user message element
      const userMessage = document.createElement("div");
      userMessage.classList.add("ai-chat-message", "user");
      userMessage.style.opacity = 0;
      userMessage.style.transition =
        "opacity 0.2s ease-in-out, transform 0.2s ease-in-out";
      userMessage.style.transform = "scale(0)";

      marked.setOptions({
        breaks: true,
      });

      userMessage.innerHTML = `
   <div style="max-width:300px">
     ${
       this.currentFile
         ? this.getFilePreviewHTML(this.currentFile.type, this.currentFile.data)
         : ""
     }
     <p>${marked.parse(messageText)}</p> <!-- Convert Markdown to HTML -->
   </div>
 `;
      messages.appendChild(userMessage);

      setTimeout(() => {
        userMessage.style.opacity = 1;
        userMessage.style.transform = "scale(1)";
      }, 100);

      input.textContent = "";

      messages.scrollTop = messages.scrollHeight;

      filePreview.innerHTML = "";

      try {
        const payload = {
          message: messageText,
          userId: USER_ID,
        };

        // Add file data if in Chat with file
        if (this.fileMode && this.currentFile) {
          switch (this.currentFile.type) {
            case "image/png":
            case "image/jpeg":
            case "image/gif":
              payload.image = this.currentFile.data;
              break;
            case "application/pdf":
              payload.pdf = this.currentFile.data;
              break;
            case "audio/mp3":
              payload.audio = this.currentFile.data;
              break;
          }
          this.currentFile = null;
          topInfoData.classList.add("active");
        }

        // Show loading message
        const loadingMessage = document.createElement("div");
        loadingMessage.classList.add("ai-chat-message", "ai");
        loadingMessage.textContent = "...";
        loadingMessage.style.opacity = 0;
        loadingMessage.style.transform = "scale(0)";
        loadingMessage.style.transition =
          "opacity .2s ease-in-out, transform .3s ease-in-out";
        messages.appendChild(loadingMessage);

        setTimeout(() => {
          loadingMessage.style.opacity = 1;
          loadingMessage.style.transform = "scale(1)";
        }, 500); //loading message dots

        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;

        const response = await fetch(CHAT_SERVER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        // Remove loading message
        messages.removeChild(loadingMessage);

        // Create AI response message element
        const aiMessage = document.createElement("div");
        aiMessage.classList.add("ai-chat-message", "ai");

        // Configure marked to treat newlines as line breaks
        marked.setOptions({
          breaks: true,
        });

        const sanitizedText = DOMPurify.sanitize(marked.parse(data.text));
        aiMessage.innerHTML = sanitizedText;
        messages.appendChild(aiMessage);

        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage = document.createElement("div");
        errorMessage.classList.add("ai-chat-message", "ai");
        errorMessage.style.setProperty(
          "background",
          "transparent",
          "important"
        );
        errorMessage.style.fontFamily = "monospace";
        errorMessage.textContent = "*Error sending message. Please try again.";
        messages.appendChild(errorMessage);
        messages.scrollTop = messages.scrollHeight;

        // Fade out and remove the error message after 3 seconds
        setTimeout(() => {
          errorMessage.style.opacity = 0;
          errorMessage.style.transition = "opacity 0.5s ease-in-out";
          setTimeout(() => {
            messages.removeChild(errorMessage);
          }, 500);
        }, 3000);
      }
    };

    // Different send behavior based on screen size
    const handleSend = (e) => {
      const isDesktop = window.innerWidth > 900;

      if (isDesktop) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      } else {
        if (e.type === "click") {
          sendMessage();
        }
      }
    };

    send.addEventListener("click", handleSend);
    input.addEventListener("keydown", handleSend);
  }

  getFilePreviewHTML(type, data) {
    if (type.startsWith("image/")) {
      return `<img src="${data}" alt="Attached Image" style="width: 100%; height: auto; style="border-radius: 8px;">`;
    } else if (type === "application/pdf") {
      return `<embed src="${data}" type="application/pdf" width="100%" height="200px" style="border-radius: 8px;">`;
    } else if (type.startsWith("audio/")) {
      return `<audio controls style="margin-top: 10px; max-width: 100%;style="border-radius: 8px">
                <source src="${data}" type="${type}">
                Your browser does not support the audio element.
              </audio>`;
    } else {
      return `<p>Unsupported file type</p>`;
    }
  }
}

// Initialize widget when script loads
document.addEventListener("DOMContentLoaded", () => {
  new ChatWidget();
});
