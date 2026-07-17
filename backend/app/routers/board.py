from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.models import Board, Card, Column, utcnow

router = APIRouter(prefix="/api/board", tags=["board"])


class CardOut(BaseModel):
    id: str
    title: str
    details: str


class ColumnOut(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardOut(BaseModel):
    columns: list[ColumnOut]
    cards: dict[str, CardOut]


class ColumnUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=64)


class CardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    details: str = ""


class CardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    details: str | None = None


class CardMove(BaseModel):
    column_id: int
    position: int = Field(ge=0)


async def _get_user_board(session: AsyncSession, user_id: int) -> Board:
    result = await session.execute(select(Board).where(Board.user_id == user_id))
    board = result.scalar_one_or_none()
    if board is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found")
    return board


async def _get_column_for_user(
    session: AsyncSession, column_id: int, user_id: int
) -> Column:
    board = await _get_user_board(session, user_id)
    result = await session.execute(
        select(Column).where(Column.id == column_id, Column.board_id == board.id)
    )
    column = result.scalar_one_or_none()
    if column is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Column not found")
    return column


async def _get_card_for_user(
    session: AsyncSession, card_id: int, user_id: int
) -> Card:
    board = await _get_user_board(session, user_id)
    result = await session.execute(
        select(Card)
        .join(Column, Card.column_id == Column.id)
        .where(Card.id == card_id, Column.board_id == board.id)
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


UserDep = Annotated[int, Depends(current_user)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=BoardOut)
async def get_board(user_id: UserDep, session: SessionDep) -> BoardOut:
    board = await _get_user_board(session, user_id)
    columns_result = await session.execute(
        select(Column).where(Column.board_id == board.id).order_by(Column.position)
    )
    columns = columns_result.scalars().all()

    cards: list[Card] = []
    if columns:
        cards_result = await session.execute(
            select(Card)
            .where(Card.column_id.in_([c.id for c in columns]))
            .order_by(Card.column_id, Card.position)
        )
        cards = list(cards_result.scalars().all())

    cards_by_column: dict[int, list[Card]] = {c.id: [] for c in columns}
    for card in cards:
        cards_by_column[card.column_id].append(card)

    return BoardOut(
        columns=[
            ColumnOut(
                id=str(c.id),
                title=c.title,
                cardIds=[str(card.id) for card in cards_by_column[c.id]],
            )
            for c in columns
        ],
        cards={
            str(card.id): CardOut(id=str(card.id), title=card.title, details=card.details)
            for card in cards
        },
    )


@router.patch("/columns/{column_id}", response_model=ColumnOut)
async def rename_column(
    column_id: int,
    body: ColumnUpdate,
    user_id: UserDep,
    session: SessionDep,
) -> ColumnOut:
    column = await _get_column_for_user(session, column_id, user_id)
    column.title = body.title
    column.updated_at = utcnow()
    session.add(column)
    await session.commit()
    await session.refresh(column)
    cards_result = await session.execute(
        select(Card).where(Card.column_id == column.id).order_by(Card.position)
    )
    return ColumnOut(
        id=str(column.id),
        title=column.title,
        cardIds=[str(c.id) for c in cards_result.scalars().all()],
    )


@router.post(
    "/columns/{column_id}/cards",
    response_model=CardOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_card(
    column_id: int,
    body: CardCreate,
    user_id: UserDep,
    session: SessionDep,
) -> CardOut:
    column = await _get_column_for_user(session, column_id, user_id)
    max_pos_result = await session.execute(
        select(Card.position)
        .where(Card.column_id == column.id)
        .order_by(Card.position.desc())
        .limit(1)
    )
    max_pos = max_pos_result.scalar_one_or_none()
    card = Card(
        column_id=column.id,
        title=body.title,
        details=body.details,
        position=(max_pos or 0) + 1000,
    )
    session.add(card)
    await session.commit()
    await session.refresh(card)
    return CardOut(id=str(card.id), title=card.title, details=card.details)


@router.patch("/cards/{card_id}", response_model=CardOut)
async def update_card(
    card_id: int,
    body: CardUpdate,
    user_id: UserDep,
    session: SessionDep,
) -> CardOut:
    card = await _get_card_for_user(session, card_id, user_id)
    if body.title is not None:
        card.title = body.title
    if body.details is not None:
        card.details = body.details
    card.updated_at = utcnow()
    session.add(card)
    await session.commit()
    await session.refresh(card)
    return CardOut(id=str(card.id), title=card.title, details=card.details)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    card_id: int, user_id: UserDep, session: SessionDep
) -> Response:
    card = await _get_card_for_user(session, card_id, user_id)
    await session.delete(card)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/cards/{card_id}/position", status_code=status.HTTP_204_NO_CONTENT)
async def move_card(
    card_id: int,
    body: CardMove,
    user_id: UserDep,
    session: SessionDep,
) -> Response:
    card = await _get_card_for_user(session, card_id, user_id)
    dest_column = await _get_column_for_user(session, body.column_id, user_id)

    dest_result = await session.execute(
        select(Card).where(Card.column_id == dest_column.id).order_by(Card.position)
    )
    dest_cards = [c for c in dest_result.scalars().all() if c.id != card.id]
    target_index = min(body.position, len(dest_cards))
    dest_cards.insert(target_index, card)

    now = utcnow()
    card.column_id = dest_column.id
    for i, c in enumerate(dest_cards):
        c.position = (i + 1) * 1000
        c.updated_at = now
        session.add(c)

    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
