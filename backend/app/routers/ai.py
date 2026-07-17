from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.ai import call_openai
from app.auth import current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


class PingRequest(BaseModel):
    prompt: str = Field(min_length=1)


class PingResponse(BaseModel):
    answer: str


UserDep = Annotated[int, Depends(current_user)]


@router.post("/ping", response_model=PingResponse)
async def ping(body: PingRequest, user_id: UserDep) -> PingResponse:
    answer = await call_openai(body.prompt)
    return PingResponse(answer=answer)
