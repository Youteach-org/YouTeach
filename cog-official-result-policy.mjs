function requireFinite(value,field){
  const number=Number(value);
  if(!Number.isFinite(number))throw new TypeError(`${field} must be a finite number.`);
  return number;
}
function requireNonNegativeInteger(value,field){
  const number=Number(value);
  if(!Number.isInteger(number)||number<0)throw new TypeError(`${field} must be a non-negative integer.`);
  return number;
}
function addUtcMonthsClamped(timestamp,months){
  const source=new Date(requireFinite(timestamp,'timestamp'));
  const year=source.getUTCFullYear();
  const month=source.getUTCMonth();
  const day=source.getUTCDate();
  const targetMonthIndex=month+months;
  const targetYear=year+Math.floor(targetMonthIndex/12);
  const targetMonth=((targetMonthIndex%12)+12)%12;
  const lastDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate();
  const targetDay=Math.min(day,lastDay);
  return Date.UTC(
    targetYear,targetMonth,targetDay,
    source.getUTCHours(),source.getUTCMinutes(),source.getUTCSeconds(),source.getUTCMilliseconds()
  );
}
function round2(value){return Math.round((Number(value)+Number.EPSILON)*100)/100;}

export function officialCogResultsEnabled(env={}){
  return String(env?.YOUTEACH_COG_OFFICIAL_RESULTS_ENABLED||'').toLowerCase()==='true' &&
    String(env?.YOUTEACH_AUTH_HARDENED||'').toLowerCase()==='true' &&
    Boolean(env?.YOUTEACH_AUTH);
}

export function expectedSuccessesForMode(modeId){
  const mode=String(modeId||'');
  if(mode==='final-race')return 30;
  if(['verb','sentence','time-clues','perfect-race'].includes(mode))return 20;
  throw new RangeError('Unsupported COG mode.');
}

export function evaluateOfficialCogAttempt({attempt={},assignmentId='',config={}}={}){
  if(attempt.completed!==true)throw new TypeError('Attempt must be complete.');
  if(String(attempt.assignmentId||'')!==String(assignmentId||'')){
    throw new TypeError('Attempt assignment does not match.');
  }
  for(const field of ['gameId','modeId','difficultyId']){
    if(String(attempt[field]||'')!==String(config[field]||'')){
      throw new TypeError(`Attempt ${field} does not match the assigned configuration.`);
    }
  }

  const startedAt=requireFinite(attempt.startedAt,'startedAt');
  const completedAt=requireFinite(attempt.completedAt,'completedAt');
  if(startedAt<=0||completedAt<startedAt)throw new RangeError('Attempt timestamps are invalid.');

  const successes=requireNonNegativeInteger(attempt.successes,'successes');
  const errors=requireNonNegativeInteger(attempt.errors,'errors');
  const expectedSuccesses=expectedSuccessesForMode(config.modeId);
  if(successes!==expectedSuccesses){
    throw new RangeError(`Attempt is not complete: expected ${expectedSuccesses} successes.`);
  }

  const attempts=successes+errors;
  const scorePercent=attempts?Math.round((successes/attempts)*100):0;
  const pointValue=requireFinite(config.pointValue,'pointValue');
  if(pointValue<=0)throw new RangeError('pointValue must be greater than zero.');

  const minimumPercent=config.minimumPercent==null||config.minimumPercent===''?null:requireFinite(config.minimumPercent,'minimumPercent');
  if(minimumPercent!=null&&(minimumPercent<0||minimumPercent>100)){
    throw new RangeError('minimumPercent must be between 0 and 100.');
  }

  const errorCodes={};
  if(attempt.errorCodes&&typeof attempt.errorCodes==='object'&&!Array.isArray(attempt.errorCodes)){
    for(const [key,value] of Object.entries(attempt.errorCodes)){
      const clean=String(key||'').trim().slice(0,80);
      if(!clean)continue;
      errorCodes[clean]=requireNonNegativeInteger(value,`errorCodes.${clean}`);
    }
  }

  return {
    attemptId:String(attempt.attemptId||'').trim().slice(0,120),
    sessionId:String(attempt.sessionId||'').trim().slice(0,120),
    assignmentId:String(assignmentId),
    gameId:String(config.gameId),
    modeId:String(config.modeId),
    difficultyId:String(config.difficultyId),
    startedAt,
    completedAt,
    completed:true,
    successes,
    errors,
    expectedSuccesses,
    scorePercent,
    pointValue,
    earnedPoints:round2((scorePercent/100)*pointValue),
    minimumPercent,
    meetsMinimum:minimumPercent==null||scorePercent>=minimumPercent,
    obstacleHits:requireNonNegativeInteger(attempt.obstacleHits||0,'obstacleHits'),
    bestStreak:requireNonNegativeInteger(attempt.bestStreak||0,'bestStreak'),
    timeMs:Math.max(0,Math.round(requireFinite(attempt.timeMs??(completedAt-startedAt),'timeMs'))),
    errorCodes
  };
}

export function receiptExpiresAt(createdAt){
  return addUtcMonthsClamped(createdAt,6);
}
