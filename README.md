# AI Fact Checker

Chrome extension + Node.js backend that fact-checks highlighted webpage text using a LangChain agent, DeepSeek, and Chroma retrieval.

## Project Structure

- `frontend/` React-based Chrome extension (Manifest V3)
- `backend/` Express API, LangChain agent, and ingestion scripts
- `backend/data.js` local dataset used for retrieval ingestion

## Prerequisites

- Node.js 18+ and npm
- Google Chrome
- DeepSeek API key
- Chroma server running at `http://localhost:8000`

## Run Locally

1. Install dependencies:

```bash
cd backend
npm install
cd ../frontend
npm install
```

2. Create `backend/.env`:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

3. Start Chroma on port `8000` (example):

```bash
chroma run --host 0.0.0.0 --port 8000
```

4. Ingest the dataset into Chroma (first run, or after changing `backend/data.js`):

```bash
cd backend
node ingest.js
```

5. Start the backend API (`http://localhost:3001`):

```bash
cd backend
npm run dev
```

6. Build and load the Chrome extension:

```bash
cd frontend
npm run build
```

Then in Chrome:

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select `frontend/build`

## Use

1. Highlight text on any webpage.
2. Open the extension popup.
3. Click **Fact Check**.
