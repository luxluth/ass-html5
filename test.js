function splitLines(strArr) {
		/*
		`[ "On a notre nouvelle reine\\Ndes ", "scream queens", "." ]` -> `["On a notre nouvelle reine", "des scream queens."]`
		`[ "Bunch of ", "losers", "." ]` -> `["Bunch of losers."]`
		`[ "Bunch of ", "losers", "\\Nand ", "nerds", "." ]` ->  `["Bunch of losers", "and nerds."]`
		*/
    let result = [];
    let line = "";
    for (let i = 0; i < strArr.length; i++) {
        line += strArr[i];
        if (strArr[i].includes("\\N")) {
            let split = strArr[i].split("\\N");
            // replace `\\N **` with empty string in the line
            line = line.replace("\\N" + split[1], "");
            // add the rest of the line to the result
            result.push(line);
            // reset the line
            line = split[1];
        }
    }
    result.push(line);
    return result;
}

// Example usage:
const example = [ "On a notre nouvelle reine\\Ndes ", "scream queens", "." ];
const example2 = [ "Bunch of ", "losers", "." ];
const example3 = [ "Bunch of ", "losers", "\\Nand ", "nerds", "." ];
const transformedExample = splitLines(example);
console.log(transformedExample);
const transformedExample2 = splitLines(example2);
console.log(transformedExample2);
const transformedExample3 = splitLines(example3);
console.log(transformedExample3);

