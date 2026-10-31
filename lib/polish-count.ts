/** Polish cardinal forms: 1, 2–4 (except 12–14), all others. */
export function polishForm(value:number,one:string,few:string,many:string){
 const n=Math.abs(Math.trunc(value)),last=n%10,lastTwo=n%100;
 return n===1?one:last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?few:many;
}
export function polishCount(value:number,one:string,few:string,many:string){
 return `${value} ${polishForm(value,one,few,many)}`;
}
export const stopCount=(n:number)=>polishCount(n,'przystanek','przystanki','przystanków');
export const transferCount=(n:number)=>polishCount(n,'przesiadka','przesiadki','przesiadek');
