// Owned deterministic fixture: expected cases are declared separately by the caller.
const value=Number(process.argv[2]);
if(!Number.isFinite(value)){console.log('invalid');process.exitCode=2;}
else console.log(String(Math.round(value*100)/100));
