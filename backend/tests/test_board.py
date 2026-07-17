def test_get_board_returns_seeded_layout(auth_client):
    r = auth_client.get("/api/board")
    assert r.status_code == 200
    data = r.json()

    assert list(data.keys()) == ["columns", "cards"]
    assert [c["title"] for c in data["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert [len(c["cardIds"]) for c in data["columns"]] == [2, 1, 2, 1, 2]
    assert len(data["cards"]) == 8
    for column in data["columns"]:
        for card_id in column["cardIds"]:
            assert card_id in data["cards"]
            card = data["cards"][card_id]
            assert set(card.keys()) == {"id", "title", "details"}
            assert card["id"] == card_id


def test_get_board_without_session_returns_401(client):
    r = client.get("/api/board")
    assert r.status_code == 401


def test_rename_column(auth_client):
    r = auth_client.patch("/api/board/columns/1", json={"title": "Icebox"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "1"
    assert body["title"] == "Icebox"

    r = auth_client.get("/api/board")
    assert r.json()["columns"][0]["title"] == "Icebox"


def test_rename_column_without_session_returns_401(client):
    r = client.patch("/api/board/columns/1", json={"title": "Icebox"})
    assert r.status_code == 401


def test_rename_column_missing_id_returns_404(auth_client):
    r = auth_client.patch("/api/board/columns/9999", json={"title": "X"})
    assert r.status_code == 404


def test_rename_column_empty_title_returns_422(auth_client):
    r = auth_client.patch("/api/board/columns/1", json={"title": ""})
    assert r.status_code == 422


def test_create_card_appends_to_column(auth_client):
    r = auth_client.post(
        "/api/board/columns/2/cards",
        json={"title": "New card", "details": "some details"},
    )
    assert r.status_code == 201
    created = r.json()
    assert created["title"] == "New card"
    assert created["details"] == "some details"
    new_id = created["id"]

    board = auth_client.get("/api/board").json()
    discovery = next(c for c in board["columns"] if c["title"] == "Discovery")
    assert new_id in discovery["cardIds"]
    assert discovery["cardIds"][-1] == new_id


def test_create_card_defaults_empty_details(auth_client):
    r = auth_client.post("/api/board/columns/1/cards", json={"title": "T"})
    assert r.status_code == 201
    assert r.json()["details"] == ""


def test_create_card_without_session_returns_401(client):
    r = client.post("/api/board/columns/1/cards", json={"title": "X"})
    assert r.status_code == 401


def test_create_card_missing_column_returns_404(auth_client):
    r = auth_client.post("/api/board/columns/9999/cards", json={"title": "X"})
    assert r.status_code == 404


def test_update_card_title_only(auth_client):
    r = auth_client.patch("/api/board/cards/1", json={"title": "Retitled"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Retitled"
    assert body["details"]


def test_update_card_details_only(auth_client):
    r = auth_client.patch("/api/board/cards/1", json={"details": "New notes"})
    assert r.status_code == 200
    body = r.json()
    assert body["details"] == "New notes"
    assert body["title"] == "Align roadmap themes"


def test_update_card_without_session_returns_401(client):
    r = client.patch("/api/board/cards/1", json={"title": "X"})
    assert r.status_code == 401


def test_update_card_missing_returns_404(auth_client):
    r = auth_client.patch("/api/board/cards/9999", json={"title": "X"})
    assert r.status_code == 404


def test_delete_card(auth_client):
    r = auth_client.delete("/api/board/cards/1")
    assert r.status_code == 204

    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    assert "1" not in backlog["cardIds"]
    assert "1" not in board["cards"]


def test_delete_card_without_session_returns_401(client):
    r = client.delete("/api/board/cards/1")
    assert r.status_code == 401


def test_delete_card_missing_returns_404(auth_client):
    r = auth_client.delete("/api/board/cards/9999")
    assert r.status_code == 404


def test_move_card_within_column(auth_client):
    # Backlog initially: [card 1, card 2]. Move card 2 to index 0 -> [2, 1].
    r = auth_client.patch(
        "/api/board/cards/2/position",
        json={"column_id": 1, "position": 0},
    )
    assert r.status_code == 204

    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    assert backlog["cardIds"] == ["2", "1"]


def test_move_card_between_columns(auth_client):
    # Move card 3 (Discovery) into Backlog at index 1: [1, 3, 2]
    r = auth_client.patch(
        "/api/board/cards/3/position",
        json={"column_id": 1, "position": 1},
    )
    assert r.status_code == 204

    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    discovery = next(c for c in board["columns"] if c["title"] == "Discovery")
    assert backlog["cardIds"] == ["1", "3", "2"]
    assert discovery["cardIds"] == []


def test_move_card_into_empty_column(auth_client):
    # Empty Discovery first (has only card 3): move card 3 elsewhere.
    auth_client.patch(
        "/api/board/cards/3/position",
        json={"column_id": 5, "position": 0},
    )
    # Now Discovery is empty. Move card 1 there.
    r = auth_client.patch(
        "/api/board/cards/1/position",
        json={"column_id": 2, "position": 0},
    )
    assert r.status_code == 204

    board = auth_client.get("/api/board").json()
    discovery = next(c for c in board["columns"] if c["title"] == "Discovery")
    assert discovery["cardIds"] == ["1"]


def test_move_card_position_beyond_end_appends(auth_client):
    # Move card 3 into Backlog at position 99 -> should append at end.
    r = auth_client.patch(
        "/api/board/cards/3/position",
        json={"column_id": 1, "position": 99},
    )
    assert r.status_code == 204

    board = auth_client.get("/api/board").json()
    backlog = next(c for c in board["columns"] if c["title"] == "Backlog")
    assert backlog["cardIds"] == ["1", "2", "3"]


def test_move_card_without_session_returns_401(client):
    r = client.patch(
        "/api/board/cards/1/position",
        json={"column_id": 1, "position": 0},
    )
    assert r.status_code == 401


def test_move_card_missing_destination_column_returns_404(auth_client):
    r = auth_client.patch(
        "/api/board/cards/1/position",
        json={"column_id": 9999, "position": 0},
    )
    assert r.status_code == 404
