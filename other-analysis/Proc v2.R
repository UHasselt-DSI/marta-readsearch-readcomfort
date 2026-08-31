# Marta
# last update 28 October 2025
##############################
# block randomized design 
# install packages by running the following command (commented out since once run, no need for doing that again)
# install.packages("blockrand")
# calling the library
library(blockrand)

# Question 1A
# for each participant
# 1) select PL
# trivial
# 2) select L from the PL group
# trivial
# 3 & 4) select two from the three other groups
#-------------------------------------------------------
# how many participants do you anticipate? 
# start with 1 to conceptualise the methodology
npart=1
# how many elements in a block?
# this is an arbitrary choice best 2,4,6, for now: 4
blocksize=4
# how many options?
# as we fix the participant language we still have three possibilities (combinatorial 2 out of 3)
nlanguageoptions=3
# prefix naming: this needs to be run for each language group
lgroup='GI' 
#lgroup='GII'  
#lgroup='GIII'
#lgroup='GIV'

# run the command
blockrand(n=npart,num.levels=nlanguageoptions,id.prefix=lgroup,block.prefix=lgroup,stratum=lgroup,block.sizes=blocksize)
# interpretation: A is GR II & III; B is GR II & IV; C is GR III & IV

# Question 1B
#--> 1A

## if balancing over languages within group is necessary --> increase possibilities or designate first and second languages and randomize between them

# Question 2 
#------------
# select the group at random 
npart=1; blocksize=4; nlanguagegroups=4; lgroup='G' 
blockrand(n=npart,num.levels=nlanguagegroups,id.prefix=lgroup,block.prefix=lgroup,stratum=lgroup,block.sizes=blocksize)
# select 2 languages from that group
# select 2 languages from the three other groups - see question 1A

# Sample size calculations
#--------------------------
# Question 1: no change versus change H0: no change is not an option; therefore at most 10% to start with:
propTestN(0.2, 0.1, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.3, 0.1, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.4, 0.1, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.5, 0.1, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")

# Question 2: 6 combinations possible H0: p=1/6
library(EnvStats)
propTestN(0.5, 1/6, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.4, 1/6, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.3, 1/6, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
propTestN(0.2, 1/6, alpha=0.05 , power=0.80 , sample.type = "one.sample", alternative = "greater")
