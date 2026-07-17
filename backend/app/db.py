from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlmodel import SQLModel

import app.models  # noqa: F401 — registers tables on SQLModel.metadata
from app.config import PROJECT_ROOT, settings
from app.models import Board, Card, Column, User

DB_DIR = PROJECT_ROOT / "data"
DB_PATH = DB_DIR / "pm.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"


def enable_sqlite_fk(target: AsyncEngine) -> None:
    @event.listens_for(target.sync_engine, "connect")
    def _fk_pragma_on_connect(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


engine: AsyncEngine = create_async_engine(DATABASE_URL, future=True)
enable_sqlite_fk(engine)

async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session


SEED_LAYOUT: list[tuple[str, int, list[tuple[str, str]]]] = [
    (
        "Backlog",
        1000,
        [
            ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
            ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
        ],
    ),
    (
        "Discovery",
        2000,
        [
            ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
        ],
    ),
    (
        "In Progress",
        3000,
        [
            ("Refine status language", "Standardize column labels and tone across the board."),
            ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
        ],
    ),
    (
        "Review",
        4000,
        [
            ("QA micro-interactions", "Verify hover, focus, and loading states."),
        ],
    ),
    (
        "Done",
        5000,
        [
            ("Ship marketing page", "Final copy approved and asset pack delivered."),
            ("Close onboarding sprint", "Document release notes and share internally."),
        ],
    ),
]


async def seed_board(session: AsyncSession, username: str) -> None:
    user = User(username=username)
    session.add(user)
    await session.flush()
    board = Board(user_id=user.id, title="My Board")
    session.add(board)
    await session.flush()
    for col_title, col_pos, cards in SEED_LAYOUT:
        column = Column(board_id=board.id, title=col_title, position=col_pos)
        session.add(column)
        await session.flush()
        for i, (title, details) in enumerate(cards):
            session.add(
                Card(
                    column_id=column.id,
                    title=title,
                    details=details,
                    position=(i + 1) * 1000,
                )
            )


async def init_db() -> None:
    needs_seed = not DB_PATH.exists()
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    if needs_seed:
        async with async_session_maker() as session:
            await seed_board(session, settings.hardcoded_username)
            await session.commit()
