from datetime import UTC, datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=64)
    password_hash: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)


class Board(SQLModel, table=True):
    __tablename__ = "boards"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    title: str = Field(default="My Board", max_length=128)
    created_at: datetime = Field(default_factory=utcnow)


class Column(SQLModel, table=True):
    __tablename__ = "columns"
    __table_args__ = (
        Index("ix_columns_board_id_position", "board_id", "position"),
    )

    id: int | None = Field(default=None, primary_key=True)
    board_id: int = Field(foreign_key="boards.id", index=True)
    title: str = Field(max_length=64)
    position: int
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Card(SQLModel, table=True):
    __tablename__ = "cards"
    __table_args__ = (
        Index("ix_cards_column_id_position", "column_id", "position"),
    )

    id: int | None = Field(default=None, primary_key=True)
    column_id: int = Field(foreign_key="columns.id", index=True)
    title: str = Field(max_length=256)
    details: str = Field(default="")
    position: int
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_user_id_created_at", "user_id", "created_at"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    role: str = Field(max_length=16)
    content: str
    created_at: datetime = Field(default_factory=utcnow)
