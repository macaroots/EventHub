class DomainError(Exception):
    pass

class NotFoundError(DomainError):
    def __init__(self, resource: str):
        super().__init__(f"{resource} não encontrado")
        self.resource = resource

class InvalidStateError(DomainError):
    pass
