export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export class DraftSaveError extends AppError {constructor(message:string,public messageId:string,status=503){super(message,status);}}
export class DraftPendingError extends AppError {constructor(message:string,public token:string,public template:boolean,status=409){super(message,status);}}
