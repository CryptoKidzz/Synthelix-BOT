const figlet = require('figlet');
const chalk = require('chalk').default;

function displayBanner() {
    const banner = figlet.textSync('Airdrop Legion Community', {
        font: 'Slant',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: false
    })
    console.log(chalk.green(banner));
    console.log(chalk.yellow('===================================================='));
    console.log(chalk.magenta('Github   : https://github.com/AirdropLegionCommunity'));
    console.log(chalk.magenta('Telegram : https://t.me/airdropalc'))
    console.log(chalk.yellow('===================================================='));
}
displayBanner()