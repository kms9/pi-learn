package main

import (
	"os"

	"github.com/kms9/pi-learn/pi_squad/controller/cli"
)

func main() {
	if err := cli.Execute(); err != nil {
		os.Exit(1)
	}
}
