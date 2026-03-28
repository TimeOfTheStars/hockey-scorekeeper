from typing import Optional

from pydantic import BaseModel, Field


# class GameState(BaseModel):
#     TournamentTitle: str = "STANLEY CUP PLAYOFFS GEICO."
#     SeriesInfo: str = "SERIES TIED 1-1"
#     BrandingImage: str = ""
#     TeamA: str = "ARC"
#     TeamAFull: str = "ARCTIC"
#     TeamB: str = "ST"
#     TeamBFull: str = "StrongTeam"
#     penalty_a: str = "None"
#     penalty_b: str = "БОЛЬШЕНСТВО 01:36"
#     ScoreA: int = 1
#     ScoreB: int = 1
#     ShotsA: int = 14
#     ShotsB: int = 17
#     logo_a: str = "team-a.png"
#     logo_b: str = "team-b.png"
#     Timer: str = "11:13"
#     PowerPlayTimer: str = "02:00"
#     PowerPlayActive: bool = False
#     Period: int = 2
#     Running: bool = False
#     Visible: bool = True


class GameStatePatch(BaseModel):
    TournamentTitle: Optional[str] = None
    SeriesInfo: Optional[str] = None
    BrandingImage: Optional[str] = None
    TeamA: Optional[str] = None
    TeamAFull: Optional[str] = None
    TeamB: Optional[str] = None
    TeamBFull: Optional[str] = None
    penalty_a: Optional[str] = None
    penalty_b: Optional[str] = None
    ScoreA: Optional[int] = Field(default=None, ge=0)
    ScoreB: Optional[int] = Field(default=None, ge=0)
    ShotsA: Optional[int] = Field(default=None, ge=0)
    ShotsB: Optional[int] = Field(default=None, ge=0)
    logo_a: Optional[str] = None
    logo_b: Optional[str] = None
    Timer: Optional[str] = None
    PowerPlayTimer: Optional[str] = None
    PowerPlayActive: Optional[bool] = None
    Period: Optional[int] = Field(default=None, ge=1)
    Running: Optional[bool] = None
    Visible: Optional[bool] = None
