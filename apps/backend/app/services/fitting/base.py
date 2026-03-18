from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import FittingRequest, FittingResponse


class FittingEngine(ABC):
    @abstractmethod
    def compute_fit(self, request: FittingRequest) -> FittingResponse:
        """Return pose landmarks and a garment placement box."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine identifier for observability."""
