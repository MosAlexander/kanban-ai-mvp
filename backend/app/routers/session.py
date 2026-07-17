from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/api/session", tags=["session"])


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionStatus(BaseModel):
    authenticated: bool


@router.get("")
def get_session(request: Request) -> SessionStatus:
    return SessionStatus(authenticated=request.session.get("user_id") is not None)


@router.post("")
def login(request: Request, body: LoginRequest) -> SessionStatus:
    if (
        body.username != settings.hardcoded_username
        or body.password != settings.hardcoded_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    request.session["user_id"] = 1
    return SessionStatus(authenticated=True)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
