from sqlalchemy import func, select

from app import db as db_module
from app.models import Board, Card, Column, User


async def test_init_db_creates_file_and_seeds():
    assert not db_module.DB_PATH.exists()

    await db_module.init_db()

    assert db_module.DB_PATH.exists()

    async with db_module.async_session_maker() as session:
        users = (await session.execute(select(User))).scalars().all()
        assert len(users) == 1
        assert users[0].username == "пользователь"

        boards = (await session.execute(select(Board))).scalars().all()
        assert len(boards) == 1
        assert boards[0].user_id == users[0].id

        columns = (
            await session.execute(select(Column).order_by(Column.position))
        ).scalars().all()
        assert [c.title for c in columns] == [
            "Backlog",
            "Discovery",
            "In Progress",
            "Review",
            "Done",
        ]
        assert [c.position for c in columns] == [1000, 2000, 3000, 4000, 5000]

        cards_count = (
            await session.execute(select(func.count()).select_from(Card))
        ).scalar_one()
        assert cards_count == 8


async def test_init_db_idempotent_on_existing_file():
    await db_module.init_db()
    await db_module.init_db()

    async with db_module.async_session_maker() as session:
        users_count = (
            await session.execute(select(func.count()).select_from(User))
        ).scalar_one()
        cards_count = (
            await session.execute(select(func.count()).select_from(Card))
        ).scalar_one()
    assert users_count == 1
    assert cards_count == 8
