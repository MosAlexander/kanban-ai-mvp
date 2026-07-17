from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.chat import AiResponse, handle_chat
from app.db import get_session
from app.models import ChatMessage

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatMessageOut(BaseModel):
    role: str
    content: str
    created_at: datetime


UserDep = Annotated[int, Depends(current_user)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=AiResponse)
async def chat(
    body: ChatRequest, user_id: UserDep, session: SessionDep
) -> AiResponse:
    return await handle_chat(session, user_id, body.message)


@router.get("/history", response_model=list[ChatMessageOut])
async def get_history(
    user_id: UserDep, session: SessionDep
) -> list[ChatMessageOut]:
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at)
    )
    return [
        ChatMessageOut(role=m.role, content=m.content, created_at=m.created_at)
        for m in result.scalars().all()
    ]


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def delete_history(user_id: UserDep, session: SessionDep) -> Response:
    await session.execute(
        delete(ChatMessage).where(ChatMessage.user_id == user_id)
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
