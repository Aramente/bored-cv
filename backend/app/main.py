from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import linkedin, offer

app = FastAPI(title="Bored CV API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://*.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(linkedin.router)
app.include_router(offer.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
