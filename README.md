# Neo4j IMDB Dataset Setup Script

This script sets up the necessary constraints, loads data from CSV files,
creates relationships between nodes, and cleans up temporary properties
for the IMBD dataset.

# Setup Frontend

```bash
# Create a new Vite project
npm create vite@latest frontend

# Navigate to the project directory
cd frontend

# Install dependencies
bun install

# Start the development server
bun run dev
```

# Setup Backend

```bash
# Create a new directory for the backend
mkdir backend

# Navigate to the project directory
cd backend

# Initialize project
bun init -y

# Set up environment variables
# Create a .env file with the following and fill it up with your database credentials
# NEO4J_URI=
# NEO4J_USER=
# NEO4J_PASSWORD=
# PORT="4000"
# OLLAMA_URL="http://localhost:11434/api/generate"
# OLLAMA_MODEL="phi3"

# Seed the Database
bun run src/seed.js

# Start the backend server
bun install
bun run start
```

# Run Ollama

```bash
# See all the installed ollama models
ollama list

# Remove a particular ollama model
ollama rm <model_name>

# Install a new ollama model
ollama pull <model_name>

# Run Ollama server
ollama serve
```
