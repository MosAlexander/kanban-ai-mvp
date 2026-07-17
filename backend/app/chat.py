import json
import logging
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import call_openai_parse
from app.models import Board, Card, ChatMessage, Column, utcnow

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 20


class CreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["create_card"]
    column_id: str
    title: str
    details: str


class EditCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["edit_card"]
    card_id: str
    title: str | None
    details: str | None


class MoveCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["move_card"]
    card_id: str
    column_id: str
    position: int


class DeleteCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["delete_card"]
    card_id: str


class RenameColumnAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["rename_column"]
    column_id: str
    title: str


BoardAction = (
    CreateCardAction
    | EditCardAction
    | MoveCardAction
    | DeleteCardAction
    | RenameColumnAction
)


class AiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply: str
    actions: list[BoardAction]


async def _get_user_board(session: AsyncSession, user_id: int) -> Board:
    result = await session.execute(select(Board).where(Board.user_id == user_id))
    board = result.scalar_one_or_none()
    if board is None:
        raise HTTPException(404, "Board not found")
    return board


async def _get_column(session: AsyncSession, board_id: int, column_id: int) -> Column:
    result = await session.execute(
        select(Column).where(Column.id == column_id, Column.board_id == board_id)
    )
    column = result.scalar_one_or_none()
    if column is None:
        raise HTTPException(404, f"Column {column_id} not found")
    return column


async def _get_card(session: AsyncSession, board_id: int, card_id: int) -> Card:
    result = await session.execute(
        select(Card)
        .join(Column, Card.column_id == Column.id)
        .where(Card.id == card_id, Column.board_id == board_id)
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise HTTPException(404, f"Card {card_id} not found")
    return card


async def _build_board_snapshot(
    session: AsyncSession, user_id: int
) -> tuple[dict, int]:
    board = await _get_user_board(session, user_id)
    columns_result = await session.execute(
        select(Column).where(Column.board_id == board.id).order_by(Column.position)
    )
    columns = list(columns_result.scalars().all())
    cards: list[Card] = []
    if columns:
        cards_result = await session.execute(
            select(Card)
            .where(Card.column_id.in_([c.id for c in columns]))
            .order_by(Card.column_id, Card.position)
        )
        cards = list(cards_result.scalars().all())

    by_col: dict[int, list[Card]] = {c.id: [] for c in columns}
    for card in cards:
        by_col[card.column_id].append(card)

    snapshot = {
        "columns": [
            {
                "id": str(c.id),
                "title": c.title,
                "cardIds": [str(x.id) for x in by_col[c.id]],
            }
            for c in columns
        ],
        "cards": {
            str(card.id): {
                "id": str(card.id),
                "title": card.title,
                "details": card.details,
            }
            for card in cards
        },
    }
    return snapshot, board.id


def _build_system_prompt(board_snapshot: dict) -> str:
    board_json = json.dumps(board_snapshot, ensure_ascii=False)
    return (
        "Ты — ассистент по управлению проектами (Kanban-доска).\n\n"
        f"Актуальный snapshot доски пользователя в формате JSON:\n{board_json}\n\n"
        "Правила:\n"
        "- Отвечай на русском языке.\n"
        "- В поле `reply` — короткий ответ пользователю (1-3 предложения).\n"
        "- Если пользователь просит изменить доску (создать/редактировать/переместить/удалить карточку или переименовать колонку), верни соответствующие действия в поле `actions`.\n"
        "- Используй ТОЛЬКО существующие id колонок и карточек из snapshot выше. Не выдумывай новые id.\n"
        "- Если запрос не требует изменения доски, `actions` оставь пустым списком.\n"
        "- В `move_card.position` — 0-based индекс в целевой колонке (0 = сверху).\n"
        "- В `edit_card` поля `title` и `details` можно оставить null, если не меняются."
    )


async def _load_history(session: AsyncSession, user_id: int) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
    )
    return list(reversed(result.scalars().all()))


async def _apply_action(
    session: AsyncSession, board_id: int, action: BoardAction
) -> None:
    if isinstance(action, CreateCardAction):
        column = await _get_column(session, board_id, int(action.column_id))
        max_pos_result = await session.execute(
            select(Card.position)
            .where(Card.column_id == column.id)
            .order_by(Card.position.desc())
            .limit(1)
        )
        max_pos = max_pos_result.scalar_one_or_none()
        card = Card(
            column_id=column.id,
            title=action.title,
            details=action.details,
            position=(max_pos or 0) + 1000,
        )
        session.add(card)
        await session.flush()
        logger.info(
            "AI create_card column_id=%s card_id=%s title=%r",
            action.column_id,
            card.id,
            action.title,
        )
    elif isinstance(action, EditCardAction):
        card = await _get_card(session, board_id, int(action.card_id))
        if action.title is not None:
            card.title = action.title
        if action.details is not None:
            card.details = action.details
        card.updated_at = utcnow()
        session.add(card)
        logger.info("AI edit_card card_id=%s", action.card_id)
    elif isinstance(action, MoveCardAction):
        card = await _get_card(session, board_id, int(action.card_id))
        dest = await _get_column(session, board_id, int(action.column_id))
        dest_result = await session.execute(
            select(Card).where(Card.column_id == dest.id).order_by(Card.position)
        )
        dest_cards = [c for c in dest_result.scalars().all() if c.id != card.id]
        target_index = min(action.position, len(dest_cards))
        dest_cards.insert(target_index, card)
        now = utcnow()
        card.column_id = dest.id
        for i, c in enumerate(dest_cards):
            c.position = (i + 1) * 1000
            c.updated_at = now
            session.add(c)
        logger.info(
            "AI move_card card_id=%s column_id=%s position=%s",
            action.card_id,
            action.column_id,
            action.position,
        )
    elif isinstance(action, DeleteCardAction):
        card = await _get_card(session, board_id, int(action.card_id))
        await session.delete(card)
        logger.info("AI delete_card card_id=%s", action.card_id)
    elif isinstance(action, RenameColumnAction):
        column = await _get_column(session, board_id, int(action.column_id))
        column.title = action.title
        column.updated_at = utcnow()
        session.add(column)
        logger.info(
            "AI rename_column column_id=%s title=%r",
            action.column_id,
            action.title,
        )


async def handle_chat(
    session: AsyncSession, user_id: int, user_message: str
) -> AiResponse:
    snapshot, board_id = await _build_board_snapshot(session, user_id)
    history = await _load_history(session, user_id)

    messages: list[dict] = [
        {"role": "system", "content": _build_system_prompt(snapshot)}
    ]
    for m in history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})

    ai_response = await call_openai_parse(messages, AiResponse)

    reply = ai_response.reply
    applied_actions = list(ai_response.actions)

    if applied_actions:
        try:
            for action in applied_actions:
                await _apply_action(session, board_id, action)
        except (HTTPException, ValueError) as exc:
            await session.rollback()
            detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
            logger.warning("AI action rejected: %s", detail)
            reply = f"{reply}\n\n[Действия не применены: {detail}]"
            applied_actions = []

    session.add(ChatMessage(user_id=user_id, role="user", content=user_message))
    session.add(ChatMessage(user_id=user_id, role="assistant", content=reply))
    await session.commit()

    return AiResponse(reply=reply, actions=applied_actions)
