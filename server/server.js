require("dotenv").config({ path: "./.env" });
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

if (!process.env.API_KEY) {
  console.error("Error: API_KEY is missing in .env");
  process.exit(1);
} else {
  console.log("Environment variables successfully loaded.");
}

// Initialize the system instruction and Google Generative AI model
let googleAiSystemInstruction = "responde amable como una customer service";

try {
  const systemInstructionPath = process.env.SYSTEM_INSTRUCTION;
  if (systemInstructionPath) {
    const contextPath = path.join(__dirname, systemInstructionPath);
    const contextData = fs.readFileSync(contextPath, "utf8");
    const context = JSON.parse(contextData);
    googleAiSystemInstruction = context.SYSTEM_INSTRUCTION || googleAiSystemInstruction;
  }
} catch (error) {
  console.error("Error reading SYSTEM_INSTRUCTION file:", error);
}

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.MODEL || "gemini-2.0-flash",
  systemInstruction: googleAiSystemInstruction,
});

// File Manager
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fileManager = new GoogleAIFileManager(process.env.API_KEY);

// Store chat sessions
const sessions = new Map(); // Store sessions per user

// Helper function to log interactions (sessionId, userId, message, response, file URL)
function logInteraction(data) {
  const logData = {
    timestamp: Date.now(), // Use Unix milliseconds timestamp
    sessionId: data.sessionId,
    userId: data.userId,
    message: data.message || null,
    response: data.response || null,
    fileUrl: data.file ? data.file.uri : null,   
  };

  console.log(JSON.stringify(logData, null, 2)); // Pretty-print the JSON log
}

// Helper Functions for Media Processing
async function processImage(imageData) {
  const filename = `${Date.now()}.png`;
  const imagePath = path.join("uploads", filename);
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  await fs.promises.writeFile(imagePath, base64Data, "base64");
  const uploadResult = await fileManager.uploadFile(imagePath, {
    mimeType: "image/png",
    displayName: filename,
  });
  await fs.promises.unlink(imagePath); // Delete local file after upload
  return uploadResult.file.uri;
}

async function processAudio(audioData) {
  const filename = `${Date.now()}.mp3`;
  const audioPath = path.join("uploads", filename);
  const base64Data = audioData.replace(/^data:audio\/\w+;base64,/, "");
  await fs.promises.writeFile(audioPath, base64Data, "base64");
  const uploadResult = await fileManager.uploadFile(audioPath, {
    mimeType: "audio/mp3",
    displayName: filename,
  });
  await fs.promises.unlink(audioPath); // Delete local file after upload
  return uploadResult.file.uri;
}

async function processPDF(pdfData) {
  const filename = `${Date.now()}.pdf`;
  const pdfPath = path.join("uploads", filename);
  const base64Data = pdfData.replace(/^data:application\/pdf;base64,/, "");
  await fs.promises.writeFile(pdfPath, base64Data, "base64");
  const uploadResult = await fileManager.uploadFile(pdfPath, {
    mimeType: "application/pdf",
    displayName: filename,
  });
  await fs.promises.unlink(pdfPath); // Delete local file after upload
  return uploadResult.file.uri;
}

app.post("/chat", async (req, res) => {
  const { message, userId, image, audio, pdf } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  // Initialize user session if it doesn't exist
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      sessionId: `session-${Date.now()}`,
      userId: userId,
      chat: model.startChat({}),
      lastFile: null,
      interactionHistory: [],
    });
  }

  const userSession = sessions.get(userId);

  // Check for the /clear or /borrar command
  if (
    message &&
    (message.trim().toLowerCase() === "/clear" ||
      message.trim().toLowerCase() === "/reset" ||
      message.trim().toLowerCase() === "/delete" ||
      message.trim().toLowerCase() === "/remove")
  ) {
    console.log(`Command used: ${message.trim().toLowerCase()}`);
    userSession.lastFile = null;
    logInteraction({
      action: "clear_last_file",
      userId,
      sessionId: userSession.sessionId,
    });
    return res.json({
      text: "File removed. You are now in chat mode 🤖",
    });
  } else if (
    message &&
    (message.trim().toLowerCase() === "/borrar" ||
      message.trim().toLowerCase() === "/eliminar")
  ) {
    console.log(`Command used: ${message.trim().toLowerCase()}`); 
    userSession.lastFile = null;
    logInteraction({
      action: "clear_last_file",
      userId,
      sessionId: userSession.sessionId,
    });
    return res.json({
      text: "Archivo eliminado. Ahora estás en modo chat 🤖",
    });
  }

  try {
    const chat = userSession.chat;
    const interactionHistory = userSession.interactionHistory || [];
    let fileUri = null;
    let mimeType = null;

    // Process and store the new file if provided
    if (image) {
      fileUri = await processImage(image);
      mimeType = "image/png";
      userSession.lastFile = { fileUri, mimeType };
    } else if (audio) {
      fileUri = await processAudio(audio);
      mimeType = "audio/mp3";
      userSession.lastFile = { fileUri, mimeType };
    } else if (pdf) {
      fileUri = await processPDF(pdf);
      mimeType = "application/pdf";
      userSession.lastFile = { fileUri, mimeType };
    } else if (userSession.lastFile) {
      fileUri = userSession.lastFile.fileUri;
      mimeType = userSession.lastFile.mimeType;
    }

    // Define a hardcoded system instruction for generateContent
    const generateContentSystemInstruction = "transcribe, describe o responde el audio. Responde conciso como un chat.";

    // Build the prompt based on message and file (if available)
    const prompt = [];
    if (fileUri) {
      prompt.push({ fileData: { fileUri, mimeType } });
    }
    if (message) {
      prompt.push(message);
    } else {
      prompt.push(generateContentSystemInstruction);
    }

    // Generate the AI response
    const result = await model.generateContent(prompt, { systemInstruction: generateContentSystemInstruction });
    const responseText = await result.response.text();

    // Log the interaction in the session structure
    logInteraction({
      sessionId: userSession.sessionId,
      userId,
      message: message || generateContentSystemInstruction,
      response: responseText,
      file: fileUri ? { uri: fileUri, mimeType } : null,
    });

    // Update interaction history
    interactionHistory.push({
      message: message || generateContentSystemInstruction,
      response: responseText,
      file: fileUri ? { uri: fileUri, mimeType } : null,
    });
    userSession.interactionHistory = interactionHistory;

    return res.json({ text: responseText, hasMedia: !!fileUri });
  } catch (error) {
    console.error("Error during chat:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
